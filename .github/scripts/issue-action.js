// fetches the relevant action run for the specified release
module.exports = async ({github, context, core}) => {
  const error_messages = [];
  const output = {};

  try {
    const release = process.env.RELEASE_TAG;
    core.info(`Release: ${release}`);

    const response = await github.rest.actions.listWorkflowRuns({
      owner: context.repo.owner,
      repo: context.repo.repo,
      workflow_id: 'project-release.yml',
      per_page: 100
    });

    if (response.data.length >= 100) {
      error_messages.push(`Maximum number of workflow runs exceeded. Results may be unreliable.`);
    }

    const filtered = response.data.workflow_runs.filter(run => run.status === 'completed' && run.head_branch === release);

    if (filtered.length < 1) {
      error_messages.push(`Unable to find workflow run for release ${release}. Double-check the correct release version is entered and all action runs for that release have completed.`);
    }
    else {
      if (filtered.length > 1) {
        core.warning(`Found ${filtered.length} workflow run(s) for release ${release}. Only the most recent run will be used. To use a different run, delete the other runs before re-triggering this action.`);
      }

      const found = filtered.shift();
      core.info(`Found run #${found.run_number} (id ${found.id}) started at ${found.run_started_at} for release ${release}.`);

      output.run_id = found.id;
      output.run_number = found.run_number;
    }
  }
  catch (error) {
    // add error and output stack trace
    error_messages.push(`Unexpected error: ${error.message}`);

    core.info('');
    core.startGroup(`Unexpected ${error.name} encountered...`);
    core.info(error.stack);
    core.endGroup();
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

      core.setFailed(`Found ${error_messages.length} problems while fetching action run.`);
    }
  }
};