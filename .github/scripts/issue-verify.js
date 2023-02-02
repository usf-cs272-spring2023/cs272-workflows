// verifies that this is a valid request
module.exports = async ({github, context, core}) => {
  const error_messages = [];
  const output = {};
  const labels = [];

  // most actions use _ underscore in names, e.g. grade_tests
  // unfortunately the associated labels use - dash in name. e/g/ grade-tests

  try {
    const results = JSON.parse(process.env.RESULTS_JSON);
    const request_type = process.env.REQUEST_TYPE;

    const release = process.env.RELEASE_TAG;
    const major = parseInt(process.env.VERSION_MAJOR);
    const minor = parseInt(process.env.VERSION_MINOR);
    const patch = parseInt(process.env.VERSION_PATCH);

    // list of github usernames that can approve PRs
    const approvers = new Set(['sjengle']);

    if (!results.hasOwnProperty(request_type) || `${results[request_type]}` != 'true') {
      error_messages.push(`The release ${results.release} is not eligible for this type of request. See the release run for details.`);
      return; // exit out of try block
    }

    // update labels and milestone
    labels.push(`project${major}`);
    labels.push(release);
    output.milestone_name = `Project ${major}`;

    // get all issues and pull requests
    const response = await github.rest.issues.listForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'all',
      per_page: 100
    });

    if (response.data.length >= 100) {
      error_messages.push(`Maximum number of issues exceeded. Results may be unreliable.`);
    }

    // stores all parsed issues
    const parsed = {
      'project1': {},
      'project2': {},
      'project3': {},
      'project4': {}
    };

    // loop through all found issues
    issues: for (const issue of response.data) {
      // loop through all of the issues
      let project = undefined;
      let issue_types = [];

      labels: for (const label of issue.labels) {
        switch (label.name) {
          case 'error':
            core.info(`Skipping issue #${issue.number} due to "error" label.`);
            continue issues;
          
          case 'project1': case 'project2': 
          case 'project3': case 'project4':
            project = label.name;
            break;
          
          case 'grade-tests': case 'grade-review': case 'grade-design':
          case 'request-code-review': case 'request-quick-review':
          case 'resubmit-code-review': case 'resubmit-quick-review':
          case 'review-passed':
            issue_types.push(label.name);
            break;
        }
      }

      if (!project || !parsed.hasOwnProperty(project)) {
        core.info(`Skipping issue #${issue.number} due to missing "project" label.`);
      }
      else {
        // store results
        for (const issue_type of issue_types) {
          if (!parsed[project].hasOwnProperty(issue_type)) {
            parsed[project][issue_type] = [];
          }

          parsed[project][issue_type].push(issue);
        }
      }
    }

    core.startGroup(`Outputting parsed issues...`);
    core.info(JSON.stringify(parsed));
    core.endGroup();

    const current  = parsed[`project${major}`];
    const previous = major > 1 ? parsed[`project${major - 1}`] : undefined;

    // collect code reviews into one array
    const code_reviews = [];

    for (const property of ['resubmit-code-review', 'resubmit-quick-review', 'review-passed']) {
      if (property in current) {
        code_reviews.push(...current[property]);
      }
    }

    // sort by pull request number
    code_reviews.sort((a,b) => b.number - a.number);

    output.found_reviews = code_reviews.length;
    core.info(`Found ${output.found_reviews} code reviews for project ${major}: ${code_reviews.map(x => x.number).join(', ')}` );

    const review_grades = 'grade-review' in current ? current['grade-review'].length : 0;
    output.review_grades = review_grades;

    // process each request type
    switch (request_type) { // TODO
      case 'grade_tests':
        // check if there shouldn't be a test grade for this release
        if (minor > 1) {
          error_messages.push(`You do not need to request a project test grade for a v${major}.${minor} release.`);
          return;
        }

        // check if there is an issue for this request already
        // if ('grade-tests' in current) {
        //   const found = current['grade-tests'][0];

        //   // if the found issue isn't this one
        //   if (found.number != context.issue.number) {
        //     error_messages.push(`You already requested a project ${major} tests grade in issue #${found.number}. You only need to request this grade ONCE per project. If the issue is closed and you do not see a grade on Canvas yet, please post on Piazza asking for an update.`);
        //     return; // exit out of try block
        //   }
        // }

        // check if there is a previous project
        if (previous != undefined) {
          // check if there is at least one code review for that project
          const has_reviews = 'grade-review' in previous;

          if (!has_reviews) {
            error_messages.push(`You must request at least one review grade for project ${major - 1} before requesting a tests grade for project ${major}.`);
            return; // exit out of try block
          }

          core.info(`Found ${previous['grade-review'].length} review grade requests for project ${major - 1}.`);
        }

        labels.push('grade-tests');
        output.assignment_name = `Project v${major}.${minor} Tests`;
        output.starting_points = 100;
        output.submitted_date  = results.release_date;
        break;

      case 'request_review':
        // make sure there is already a test grade issue
        const has_tests = 'grade-tests' in current;
        if (!has_tests) {
          error_messages.push(`You must have a passing project ${major} tests grade issue before requesting your first code review appointment.`);
          return; // exit out of try block
        }

        // make sure didn't already pass code review
        if ('review-passed' in current) {
          error_messages.push(`You passed code review in #${current['review-passed'][0].number} and do not need any more project ${major} code reviews. Did you mean to request a design grade instead?`);
          return; // exit out of try block
        }

        // check if there is a design grade issue for the previous project
        if (previous != undefined) {
          const has_design = 'grade-design' in previous;
          if (!has_design) {
            error_messages.push(`You must have a passing project ${major - 1} design grade issue before requesting your first project ${major} code review appointment.`);
            return; // exit out of try block
          }
        }

        // check if this review was already requested (duplicate request)
        for (const issue of code_reviews) {
          const found = issue.labels.find(label => label.name.startsWith(`v${major}.${minor}`));
          if (found != undefined) {
            error_messages.push(`You already had release ${found.name} code reviewed in pull request #${issue.number}. Did you mean to request a code review for a different release?`);
            return; // exit out of try block
          }
        }

        // check minor number and found reviews matches
        if (minor != output.found_reviews) {
          error_messages.push(`The release version should be v${major}.${output.found_reviews}.x instead of v${major}.${minor}.x to match the number of previous code reviews for this project.`);
          return; // exit out of try block
        }

        // check if have a grade for previous review
        if (output.found_reviews != review_grades && minor < 3) {
          error_messages.push(`Found ${output.found_reviews} code reviews but only ${review_grades} review grade requests. Please request a review grade for your last code review before requesting your next code review appointment.`);
          return; // exit out of try block
        }

        output.last_type = '';  // type of last pull request
        output.last_pull = '';  // number of last pull request
        output.last_date = '';  // date last pull request was approved

        output.check_date = ''; // date to check eligibility against

        output.next_type = output.found_reviews > 1 ? 'request-quick-review' : 'request-code-review';

        if (output.found_reviews != 0) {
          const latest = code_reviews[0];
          core.info(`Latest review: #${latest.number}, labels: ${latest.labels.map(x => x.name).join(', ')}`);

          output.last_pull = latest.number;
          output.last_type = latest.labels.find(label => label.name.startsWith('request'))?.name;

          // check if shouldn't be a quick review for some reason
          const resubmit = `${latest.labels.find(label => label.name.startsWith('resubmit'))?.name}`;

          if(resubmit.includes('code')) {
            output.next_type = 'request-code-review';
          } 

          // figure out when the latest review was approved
          try {
            const list_reviews = await github.rest.pulls.listReviews({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: latest.number,
              per_page: 100
            });

            const approved = list_reviews.data.find(review => approvers.has(review.user.login));
            output.last_date = approved.submitted_at;
            output.check_date = output.last_date;

            core.info(`Latest pull request #${latest.number} was approved at: ${output.check_date}`);
          }
          catch (error) {
            core.info(error);
            error_messages.push(`Unable to determine when pull request #${latest.number} was approved.`);
            return;
          }

          // if the last review was a 15 minute review, look one more back for the check date
          if (output.last_type == 'request-quick-review' && code_reviews.length > 1) {
            const earlier = code_reviews[1];
            core.info(`Earlier review: #${earlier.number}, labels: ${earlier.labels.map(x => x.name).join(', ')}`);

            // figure out when the latest review was approved
            try {
              const list_reviews = await github.rest.pulls.listReviews({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: latest.number,
                per_page: 100
              });

              const approved = list_reviews.data.find(review => approvers.has(review.user.login));
              output.check_date = approved.submitted_at;
              core.info(`Earlier pull request #${earlier.number} was approved at: ${output.check_date}`);
            }
            catch (error) {
              core.info(error);
              error_messages.push(`Unable to determine when pull request #${latest.number} was approved.`);
              return;
            }
          }
        }

        labels.push(output.next_type);
        break;

      case 'grade_review':
        if (minor > 1) {
          error_messages.push(`You do not need to request a project review grade for a v${major}.${minor} release.`);
          return;
        }

        // check if there is an issue for this request already
        const has_reviews = 'grade-review' in current;
        if (has_reviews) {
          for (const issue of current['grade-review']) {
            const found = issue.labels.find(label => label.name.startsWith(`v${major}.${minor}`));
            if (found != undefined) {
              error_messages.push(`You already requested project ${major} review grade for release ${found.name} in issue #${issue.number}. If you are missing an expected grade on Canvas, please post on Piazza.`);
              return; // exit out of try block
            }
          }
        }

        // see if can find a code review for this request
        let found = code_reviews.find(item => item.labels.some(label => label.name == release));

        if (found == undefined) {
          error_messages.push(`Could not find an approved code review pull request for release ${release}. You cannot request this grade until the professor has reviewed your code and approved the pull request.`);
          return;
        }

        core.info(`Found pull request #${found.number} for release ${release}.`);

        // figure out when the review was approved
        try {
          const list_reviews = await github.rest.pulls.listReviews({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: found.number,
            per_page: 100
          });

          const approved = list_reviews.data.find(review => approvers.has(review.user.login));
          output.submitted_date = approved.submitted_at;
        }
        catch (error) {
          core.info(error);
          error_messages.push(`Unable to determine when pull request #${found.number} was approved.`);
          return;
        }

        // set the other values
        labels.push('grade-review');
        output.assignment_name = `Project v${major}.${minor} Review`;
        output.starting_points = 100;
        output.pull_request = found.number;
        break;

      case 'grade_design':
        // check if there is an issue for this request already
        if ('grade-design' in current) {
          const found = current['grade-design'][0];

          // if the found issue isn't this one
          if (found.number != context.issue.number) {
            error_messages.push(`You already requested a project ${major} design grade in issue #${found.number}. You only need to request this grade ONCE per project. If the issue is closed and you do not see a grade on Canvas yet, please post on Piazza asking for an update.`);
            return; // exit out of try block
          }
        }

        // make sure already pass code review
        const passed = current?.['review-passed']?.[0];

        if (passed == undefined) {
          error_messages.push(`Unable to find a passing code review pull request for project ${major}. You must have a pull request that passed code review to request this grade.`);
          return; // exit out of try block
        }

        if (review_grades < 2) {
          error_messages.push(`Found only ${review_grades} review grade request(s). Please request all review grades before requesting your design grade.`);
          return; // exit out of try block
        }

        core.info(`Found pull request #${passed.number} passed code review for project ${major}.`);

        labels.push('grade-design');
        output.assignment_name = `Project v${major}.x Design`;
        output.starting_points = 100;
        output.submitted_date  = results.release_date;
        output.pull_request = passed.number;
        break;
      
      default:
        error_messages.push(`Unexpected request type: ${request_type}`);
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
    // convert labels to json
    output.labels = JSON.stringify(labels);

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

      core.setFailed(`Found ${error_messages.length} problems while verifying this request.`);
    }
  }
};
