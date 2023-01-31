// creates pull request for this release
module.exports = async ({github, context, core}) => {
  const error_messages = [];
  const output = {};
  const release = process.env.RELEASE_TAG;

  try {
    // prevent merging on the pull request until after a review is approved
    await github.rest.repos.updateBranchProtection({
      owner: context.repo.owner,
      repo: context.repo.repo,
      branch: `review/${release}`,
      required_status_checks: null,
      enforce_admins: null,
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        bypass_pull_request_allowances: {
          users: ['halenander', 'mtquach2', 'ybsolomon', 'sjengle']
        }
      },
      restrictions: null,
      allow_deletions: true
    });
  }
  catch (error) {
    error_messages.push(`Unable to protect review branch for release ${release} (${error.name}: ${error.message}).`);
  }
  finally {
    // output and set results
    core.startGroup('Setting output...');
    for (const property in output) {
      console.log(`${property}: ${output[property]}`);
      core.setOutput(property, output[property]);
    }
    core.endGroup();

    // save and output all errors
    if (error_messages.length > 0) {
      const formatted = error_messages.map(x => `  1. ${x}\n`).join('');
      core.setOutput('error_messages', formatted);

      core.startGroup(`Outputting errors...`);
      for (const message of error_messages) {
        core.error(message);
      }
      core.endGroup();

      core.setFailed(`Found ${error_messages.length} problems while protecting the review branch.`);
    }
  }
};