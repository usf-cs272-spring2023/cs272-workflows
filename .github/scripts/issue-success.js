// updates the issue comment with the successful request
module.exports = async ({github, context, core, DateTime, Settings}) => {
  const results = JSON.parse(process.env.RESULTS);

  const review_delay = 1; // days to wait in between code reviews

  const request_type = results.parse_request.outputs.request_type;
  const grade_request = request_type.startsWith('grade_');
  core.info(`Request Type: ${request_type}`);

  const zone = 'America/Los_Angeles';
  const eod = 'T23:59:59';
  Settings.defaultZone = zone;

  // TODO Convert to running all three updates at same time

  try {
    const comment_id = process.env.COMMENT_ID;

    const release_tag = results?.parse_request?.outputs?.release_tag;
    const release_link = `https://github.com/${context.repo.owner}/${context.repo.repo}/releases/tag/${release_tag}`;
    const request_link = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

    const verified_id = results?.find_release?.outputs?.run_id;
    const verified_link = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${verified_id}`;

    const student_name = results?.parse_request?.outputs?.name;
    const usf_email = results?.parse_request?.outputs?.email;

    let message = undefined;

    if (grade_request) {
      const late_interval   = results?.calculate_grade?.outputs?.late_interval;
      const late_multiplier = results?.calculate_grade?.outputs?.late_multiplier;
      const late_points     = results?.calculate_grade?.outputs?.late_points;
      const late_percent    = results?.calculate_grade?.outputs?.late_percent;
      const grade_points    = results?.calculate_grade?.outputs?.grade_points;
      const grade_possible  = results?.calculate_grade?.outputs?.grade_possible;
      const grade_percent   = results?.calculate_grade?.outputs?.grade_percent;

      // check if a pull request is provided
      let pull_request = results?.verify_request?.outputs?.pull_request;
      pull_request = pull_request == undefined ? '*N/A*' : `Pull Request #${pull_request}`;

      message = `
:octocat: @${ context.actor }, your [grade request](${request_link}) has been processed! See the details below:

|  |  |
|----:|:-----|
|   Student: | ${student_name} |
| USF Email: | <${usf_email}> |
| | |
|   Assignment: | ${results?.calculate_grade?.outputs?.assignment_name} |
|      Release: | [\`${release_tag}\`](${release_link}) (verified in [run ${verified_id}](${verified_link})) |
| Pull Request: | ${pull_request} |
|     Deadline: | ${results?.calculate_grade?.outputs?.deadline_text} |
|    Submitted: | ${results?.calculate_grade?.outputs?.submitted_text} |
| | |
| Late&nbsp;Interval: | ${late_interval} hours (x${late_multiplier} multiplier) |
| Late&nbsp;Penalty:  | -${late_points} points (-${late_percent}%) |
| Final&nbsp;Grade:   | **${grade_points}** / ${grade_possible} points (${grade_percent}%) |

:white_check_mark: We will close this issue after updating your grade on Canvas. If your grade is not updated in 2 business days, please reach out on Piazza.
      `;
    }
    else if (request_type == 'request_review') {
      const review_type = results?.verify_request?.outputs?.next_type;
      const review_text = review_type == 'request-code-review' ? 'Code' : 'Quick';
      const review_time = review_type == 'request-code-review' ? 20 : 10;

      const release_date = DateTime.fromISO(JSON.parse(results?.download_json?.outputs?.release_date));
      const today_date = DateTime.now();

      let eligible_date = undefined;

      const last_type = results?.verify_request?.outputs?.last_type;

      let last_pull_text = '*N/A*';
      let last_time_text = '*N/A*';
      let last_date_text = '*N/A*';

      // set last review values if appropriate
      if (last_type) {
        last_pull_text = `Pull Request #${results?.verify_request?.outputs?.last_pull}`;
        last_time_text = last_type == 'request-code-review' ? '30 minutes' : '15 minutes';

        let last_date = DateTime.fromISO(`${results?.verify_request?.outputs?.last_date}`);
        let check_date = DateTime.fromISO(`${results?.verify_request?.outputs?.check_date}`);

        if (!last_date.isValid) {
          core.warning(`Unable to parse last code review date: ${results?.verify_request?.outputs?.last_date}`);
          last_date_text = '*Undefined*';
        }
        else {
          last_date_text = `${last_date.toLocaleString(DateTime.DATETIME_FULL)}`;
          eligible_date = last_date.plus({days: review_delay});
        }

        // use check_date instead if it is provided
        if (check_date.isValid) {
          eligible_date = check_date.plus({days: review_delay});
        }
      }

      // make sure we have an eligible date that is today or later (not in the past)
      if (eligible_date == undefined || !eligible_date.isValid || eligible_date < today_date) {
        eligible_date = today_date;
      }

      // create appointment link
      const autofill = `name=${encodeURIComponent(student_name)}&email=${encodeURIComponent(usf_email)}&a1=${encodeURIComponent(context.payload.issue.html_url)}`;

      const sophie_link = `https://calendly.com/sjengle/${review_text.toLowerCase()}-review?month=${eligible_date.toFormat('yyyy-MM')}&date=${eligible_date.toFormat('yyyy-MM-dd')}&${autofill}`;
      let signup_link = `Use [this personalized appointment signup link](${sophie_link}) to sign up for a code review appointment. *This link will autofill most of the required information.*`;

      core.info(`Signup Link: ${signup_link}`);

      message = `
:octocat: @${ context.actor }, your [${review_text.toLowerCase()} review request](${request_link}) for [release ${release_tag}](${release_link}) is approved:

|  |  |
|----:|:-----|
|   Student: | ${student_name} |
| USF Email: | <${usf_email}> |
| | |
| Project: | ${results?.verify_request?.outputs?.milestone_name} |
| Release: | [\`${release_tag}\`](${release_link}) (verified in [run ${verified_id}](${verified_link})) |
| Created: | ${release_date.toLocaleString(DateTime.DATETIME_FULL)} |
| | |
|   Last Review: | ${last_pull_text} |
|   Review Date: | ${last_date_text} |
| Review Length: | ${last_time_text} |
| | |
|   This Review: | ${review_time} min ${review_text} Review |
| Eligible Date: | ${eligible_date.toLocaleString(DateTime.DATETIME_FULL)} |

## Instructions 

:eyes: Read the instructions below **carefully** to avoid common issues that will delay your appointment!

  1. :spiral_calendar: ${signup_link}

  2. :warning: Make sure to sign up for a single appointment on or after **${eligible_date.toLocaleString(DateTime.DATETIME_FULL)}**. *If there are no appointments in the next 3 business days, make a **public post** on Piazza to see if more can be added to the schedule.*

  3. :no_entry_sign: Do not make modifications to the code in your \`main\` branch before your appointment. *If your code is not ready for code review, close this request, cancel your appointment, and re-request a code review when your code is ready.*

  4. :stop_sign: Do not merge this pull request until **AFTER** the code review appointment. *If you accidentally merge this pull request before your appointment, you will have to close this review request, cancel your appointment, and re-request a code review.*

Make sure to attend your appointment on-time; arriving more than 5 minutes late may result in your appointment being cancelled.
      `;
    }
    else {
      message = `:octocat: @${ context.actor }, this is an [unexpected request type](${request_link}). Please reach out to the instructor on Piazza.`;
      core.warning(`Unexpected request type: ${request_type}`);
    }

    // update issue comment
    const updated = await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: comment_id,
      body: message
    });

    core.info(`Updated issue comment id ${comment_id} with request results.`);
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);
    core.setFailed(`Unable to update comment for issue #${context?.payload?.issue?.number}.`);
  }

  try {
    let reviewers = ['sjengle'];

    // request code review if necessary
    if (request_type == 'request_review') {
      const reviewed = await github.rest.pulls.requestReviewers({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: results?.create_pull?.outputs?.pull_request,
        reviewers: reviewers
      });

      core.info(`Updated pull request #${results?.create_pull?.outputs?.pull_request} with reviewers.`);
    }
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);
    core.setFailed(`Unable to update pull request #${results?.create_pull?.outputs?.pull_request} with reviewers.`);
  }

  // update issue with assignees, labels, and milestone
  try {
    const params = {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.issue.number,
      labels: JSON.parse(results?.verify_request?.outputs?.labels),
      milestone: results?.get_milestone?.outputs?.milestone_id,
      state: 'open'
    };

    if (grade_request) {
      params.assignees = ['halenander', 'mtquach2', 'ybsolomon'];
    }
    else if (request_type == 'request_review') {
      params.assignees = [context.actor];
    }
    else {
      // unexpected type
      params.labels.push('error');
      params.state = 'closed';
    }

    core.startGroup(`Update parameters...`);
    core.info(JSON.stringify(params, null, '  '));
    core.endGroup();

    const updated = await github.rest.issues.update(params);

    core.info('');
    core.info(`Updated issue #${context?.payload?.issue?.number} with successful request.`);
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);
    core.setFailed(`Unable to update results for issue #${context?.payload?.issue?.number}.`);
  }
};