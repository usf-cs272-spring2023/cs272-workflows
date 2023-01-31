// checks if the issue event is valid; i.e. a student is not modifying the issue improperly.
module.exports = async ({github, context, core}) => {
  // users that are allowed to edit labels or assignees
  const allowed = new Set(['halenander', 'mtquach2', 'ybsolomon', 'sjengle']);

  // get event information
  const action = context.payload.action;
  const sender = context.payload.sender.login;
  const output = `Action: ${action}, Sender: ${sender}`;

  // return if allowed
  if (allowed.has(sender)) {
    core.info(`✅ ${output}`);
    return;
  }

  // indicate this check failed
  core.setFailed(`❌ ${output}`);

  // store error messages
  const error_messages = [`Only approved users may modify issue labels and assignees!`];

  // common params used for requests
  const params = {
    owner: context.payload.organization.login,
    repo: context.payload.repository.name,
    issue_number: context.payload.issue.number
  };

  core.info('');
  core.startGroup(`Undoing ${action} action...`);
  core.info(JSON.stringify(params));
  core.endGroup();

  try {
    // try to undo the change
    let added = undefined;
    let response = undefined;

    switch (action) {
      case 'labeled':
        added = context.payload.label.name;
        response = await github.rest.issues.removeLabel({...params, name: added});
        break;

      case 'assigned':
        added = context.payload.assignee.login;
        response = await github.rest.issues.removeAssignees({...params, assignees: added});
        break;

      default:
        error_messages.push(`Unexpected event type: \`${action}\``);
    }

    // if make it this far, report result
    if (response != undefined && response.status === 200) {
      core.info(`Removed ${added} from issue (status: ${response.status}).`);
    }
    else {
      error_messages.push(`Unable to remove ${added}.`);

      core.info('');
      core.startGroup(`Failed to undo ${action} action...`);
      core.info(JSON.stringify(response));
      core.endGroup();
    }
  }
  catch(error) {
    // add error and output stack trace
    error_messages.push(`Unexpected error: ${error.message}`);

    core.info('');
    core.startGroup(`Unexpected ${error.name} encountered...`);
    core.info(error.stack);
    core.endGroup();
  }
  finally {
    core.info('');
    core.startGroup(`Outputting errors...`);
    for (const message of error_messages) {
      core.error(message);
    }
    core.endGroup();

    core.info('');
    core.startGroup(`Outputting context...`);
    core.info(JSON.stringify(context));
    core.endGroup();

    // create issue_body
    const formatted = error_messages.map(x => `  1. ${x}`);
    const issue_body = `@${context.sender} there are ${error_messages.length} problem(s) with your ${action} action:

${formatted.join('\n')}

:octocat: See [run id ${context.runId}](https://github.com/${context.payload.repository.full_name}/actions/runs/${context.runId}) for details.
    `;
    
    // attempt to comment on issue
    Promise.allSettled([
      github.rest.issues.createComment({...params, body: issue_body})
    ]).then((results) => {
      core.startGroup(`Outputting status...`);
      core.info(JSON.stringify(results));
      core.endGroup();
    });
  }
};
