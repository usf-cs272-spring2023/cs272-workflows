// updates the pull request based on the submitted review
module.exports = async ({github, context, core}) => {
  try {
    // stores all of the requests to wait for
    const requests = [];

    // fetch request details
    const state  = context.payload.review.state;

    // core.info(JSON.stringify(context.payload.pull_request));
    const number = context.payload.pull_request.number;
    const body   = context.payload.pull_request.body;
    const user = context.payload.pull_request.assignee.login;

    // core.info(JSON.stringify(context.payload.review));
    const review = context.payload.review.body.toLowerCase();
    const login  = context.payload.review.user.login;
    
    // add the review label
    let label = 'error';
    
    if (review.includes('resubmit')) {
      label = review.includes('quick') ? 'resubmit-quick-review' : 'resubmit-code-review';
    }
    else if (review.endsWith('pass')) {
      label = 'review-passed';
    }

    // add instructions to comment
    let header  = `:octocat: @${user}, `;
    let comment = '';
    let footer  = `See [run #${context.runNumber} (id ${context.runId})](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) for details.`;

    // parse pull request body 
    const json_regex = /```json([^`]+)```/;
    const json_match = body.match(json_regex);

    if (json_match === null || json_match.length !== 2) {
      const message = 'Unable to locate JSON configuration in pull request body.';
      header += 'there was an issue with this review:'
      comment = `  - ${message}`;
      core.setFailed(message);
    }
    else {
      const parsed = JSON.parse(json_match[1]);
      console.log(`Parsed: ${JSON.stringify(parsed)}`);

      // attempt to parse the release
      const tag_regex = /^v([1-4])\.(\d+)\.(\d+)$/;
      const tag_match = parsed.release.match(tag_regex);

      if (tag_match === null || tag_match.length !== 4) {
        const message = `Unable to parse "${parsed.release}" into major, minor, and patch version numbers.`;
        header += 'there was an issue with this review:'
        comment = `  - ${message}`;
        core.setFailed(message);
      }
      else {
        const version_major = parseInt(tag_match[1]);
        const version_minor = parseInt(tag_match[2]);
        const version_patch = parseInt(tag_match[3]);

        switch (label) {
          case 'resubmit-quick-review':
          case 'resubmit-code-review':
            header += `your code review for project ${version_major} has been processed. Your next steps are:`
            comment = `
  - [ ] On GitHub, click the "Merge" button to merge this pull request #${number} into the \`main\` branch. Then, in Eclipse, use the "Team" » "Pull" option to pull the changes made to your \`main\` branch.
  - [ ] Fix any remaining \`TODO\` comments in the code, then commit and push those changes to GitHub. Then, create a new \`v${version_major}.${version_minor + 1}.x\` release that passes all of the checks.
  - [ ] Use the [Request Project Code Review](${context.payload.repository.html_url}/issues/new?assignees=&labels=&template=request-project-review.md&title=Request+Project+Code+Review) issue template to request your next code review appointment for the new \`v${version_major}.${version_minor + 1}.x\` release.`;

            if (version_minor < 2) {
              comment = `
  - [ ] Use the [Request Project Review Grade](${context.payload.repository.html_url}/issues/new?assignees=&labels=&template=request-project-grade-review.md&title=Request+Project+Review+Grade) issue template to request your project ${version_major} review ${version_minor + 1} grade. Use release \`${parsed.release}\` in the request.${comment}`;
            }

            break;

          case 'review-passed':
            header = `:tada: Congratulations @${user}, you **passed** code review for project ${version_major}! Your next steps are:`;
            comment = `
  - [ ] On GitHub, click the "Merge" button to merge this pull request #${number} into the \`main\` branch. Then, in Eclipse, use the "Team" » "Pull" option to pull the changes made to your \`main\` branch.
  - [ ] Fix any remaining \`TODO\` comments in the code, then commit and push those changes to GitHub. Then, create a final \`v${version_major}.${version_minor + 1}.x\` release that passes all of the checks.
  - [ ] Use the [Request Project Design Grade](${context.payload.repository.html_url}/issues/new?assignees=&labels=&template=request-project-grade-design.md&title=Request+Project+Design+Grade) issue template to request your project ${version_major} design grade. Use the new \`v${version_major}.${version_minor + 1}.x\` release in the request.
  - [ ] Merge the functionality for project ${version_major + 1} into the \`main\` branch.`;

            break;

          default:
            header += 'the review comment has an unexpected format:'
            comment = `  > ${body}`;
            core.setFailed(`The review comment has an unexpected format: ${body}`);
        }
      }
    }

    // update comment
    requests.push(github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: process.env.COMMENT_ID,
      body: `${header}\n\n${comment}\n\n${footer}`
    }));

    // add label to request
    requests.push(github.rest.issues.addLabels({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: number,
      labels: [label]
    }));

    // check the review state
    /* if (state != 'approved') {
      core.warning(`Unexpected review state: ${state}`);
      const message = `:octocat: Oops @${login}, did you mean to set the review status to \`${state}\`? Reviews must be set to \`approved\` to be recognized by the autograder system. @${context.actor}, if you don't receive a response from the professor within 2 business days, please reach out on Piazza!`;

      requests.push(github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: number,
        body: message
      }));
    } */

    Promise.all(requests).then(values => core.info(`Pull request ${number} updated successfully.`));
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);
    core.setFailed(`Unable to update pull request #${context?.payload?.pull_request?.number}.`);
  }
};