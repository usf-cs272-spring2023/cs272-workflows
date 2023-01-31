// checks the pull requests to determine if the minor number makes sense
module.exports = async ({github, context, core}) => {
  const major = parseInt(process.env.VERSION_MAJOR);
  const minor = parseInt(process.env.VERSION_MINOR);
  const patch = parseInt(process.env.VERSION_PATCH);
  const release = `v${major}.${minor}.${patch}`;

  core.info(`Release: ${release}, Project: ${major}, Review: ${minor}, Patch: ${patch}`);

  try {
    const pull_list = await github.rest.pulls.list({
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'all',
      per_page: 100
    });

    // check if no pull requests yet in repository
    if (!pull_list.hasOwnProperty('data') || pull_list.data.length == 0) {
      core.info('Found 0 pull requests.');

      if (minor != 0) {
        core.setFailed(`The release version should start with v${major}.0, not with v${major}.${minor}, since you have 0 code reviews. You may want to delete the ${release} release *and* tag (two separate steps).`);
      }

      return;
    }

    // otherwise we have pull requests to look through
    core.info(`Found ${pull_list.data.length} pull requests.`);

    // check if exceeding number of pull requests can fetch at once
    if (pull_list.data.length >= 100) {
      core.error(`Maximum number of pull requests exceeded. Results may be unreliable.`);
    }

    const approved = []; // stores pull requests approved by professor
    const project = `project${major}`; // label for this project code reviews

    // loop through all of the pull requests
    for (const pull of pull_list.data) {
      // assume only instructor can modify labels, use to determine passing code reviews
      const labels = new Set(pull.labels.map(label => label.name));

      // check if pull request is for this project
      if (labels.has(project)) {
        if (labels.has('review-passed')) {
          core.info(`Pull request #${pull.id} passed code review.`);
          core.setOutput('review_passed', pull.id);
          approved.push(pull);
        }
        else if (labels.has('resubmit-quick-review') || labels.has('resubmit-code-review')) {
          approved.push(pull);
        }
      }
    }

    core.info(`Found ${approved.length} code reviews for project ${major}.`);

    if (approved.length != minor) {
      core.setFailed(`This release version should start with v${major}.${approved.length}, not with v${major}.${minor}, since you have ${approved.length} code reviews for project ${major} already. You may want to delete the ${release} release *and* tag (two separate steps).`);
    }
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);
    core.setFailed(`Unable to check minor version of the ${release} release.`);
  }
};