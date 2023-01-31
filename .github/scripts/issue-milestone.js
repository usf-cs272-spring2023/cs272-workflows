// get or create milestone associated with project
module.exports = async ({github, context, core}) => {
  const error_messages = [];
  const output = {};
  const milestone_name = process.env.MILESTONE_NAME;

  try {
    // get existing milestones
    const milestones = await github.rest.issues.listMilestones({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100
    });

    // find milestone with same name
    let found = milestones.data.find(milestone => milestone.title == milestone_name);

    // check if needs to be created instead
    if (found == undefined) {
      const created = await github.rest.issues.createMilestone({ owner: context.repo.owner, repo: context.repo.repo, title: milestone_name });
      found = created.data;
    }

    core.setOutput('milestone_id', found.number);
    core.info(`Milestone ${found.title} has number ${found.number}.`);
  }
  catch (error) {
    error_messages.push(`Unable to find or create ${milestone_name} milestone for this request.`);
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

      core.setFailed(`Found ${error_messages.length} problems while finding milestone for this request.`);
    }
  }
};