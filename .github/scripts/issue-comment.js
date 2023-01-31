// adds a comment to the issue to let user know the action is running
module.exports = async ({github, context, core}) => {
  const message = `:octocat: Your request is being processed. See [run #${context.runNumber} (id ${context.runId})](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) for details.`;

  try {
    let issue_number = context?.payload?.issue?.number;

    if (issue_number == undefined) {
      issue_number = context?.payload?.pull_request?.number;
    }

    const response = await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue_number,
      body: message
    });

    core.info(`Created comment id ${response.data.id}.`);
    core.setOutput('comment_id', response.data.id);
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);

    core.startGroup('Outputting context...');
    core.info(JSON.stringify(context));
    core.endGroup();

    core.setFailed(`Unable to add comment to issue #${context?.payload?.issue?.number}.`);
  }
};