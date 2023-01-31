// creates pull request for this release
module.exports = async ({github, context, core}) => {
  const error_messages = [];
  const output = {};
  const release = process.env.RELEASE_TAG;

  try {
    // create the pull request
    const result = await github.rest.pulls.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      head: `review/${release}`,
      base: 'main',
      issue: context.payload.issue.number
    });

    output.pull_request = result.data.number;
  }
  catch (error) {
    error_messages.push(`Unable to create pull request for release ${release} (${error.name}: ${error.message}).`);
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

      core.setFailed(`Found ${error_messages.length} problems while creating the pull request.`);
    }
  }
};