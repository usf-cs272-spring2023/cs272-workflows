// checks the releases to determine if the major number makes sense
// and which requests can be made based on the past results
module.exports = async ({github, context, core, fs}) => {
  const release = process.env.RELEASE_TAG;
  const major = parseInt(process.env.VERSION_MAJOR);
  const minor = parseInt(process.env.VERSION_MINOR);
  const patch = parseInt(process.env.VERSION_PATCH);

  core.info(`Release: ${release}, Project: ${major}, Review: ${minor}, Patch: ${patch}`);

  const output = {
    artifact: 'check-release-results',
    filename: 'check-release-results.json',

    release: release,
    release_date: undefined,
    
    project: major,

    check_tests: false,
    check_style: false,

    grade_tests:    false, // true if minor release is 0 and passing tests
    request_review: false, // true if tests and style checks pass and previous release did NOT pass code review
    grade_review:   false, // true if can request review and minor release is less than 2
    grade_design:   false  // true if passing tests and style and previous release passed code review
  };

  try {
    // try to parse job and step results
    const results = process.env.RESULTS;
    const json = JSON.parse(results);
  
    for (const property in json) {
      if (json[property].hasOwnProperty('outputs')) {
        if (json[property]['outputs'].hasOwnProperty('status')) {
          const parsed = JSON.parse(json[property]['outputs']['status']);
          json[property]['outputs']['status'] = parsed;
        }
      }
    }
  
    core.startGroup('Outputting job status...');
    core.info(JSON.stringify(json, null, '  '));
    core.endGroup();

    // get results from status
    output.check_tests = json?.check_tests?.result === 'success';
    output.check_style = json?.check_style?.result === 'success';

    output.release_date  = json?.check_tests?.outputs?.status?.parse_release?.outputs?.release_date;
    output.review_passed = json?.check_style?.outputs?.status?.check_minor?.outputs?.review_passed;

    // set grade eligibility
    if (!output.check_tests) {
      core.error(`❌ The release ${release} may not be used to request any project ${major} grades or code reviews.`);
    }
    else {
      if (minor === 0) {
        output.grade_tests = true;
        core.notice(`✅ The release ${release} may be used to request a project ${major} tests grade. This grade only needs to be requested once.`);
      }
      else {
        core.info(`ℹ️ The release ${release} cannot be used to request a project ${major} tests grade because of the minor version number.`);
      }

      if (output.check_style) {
        if (output.review_passed != undefined) {
          output.grade_design = true;

          if (minor < 2) {
            // happens rarely; only when students have already made progress on this project in previous semesters
            output.grade_review = true;
            core.notice(`✅ The release ${release} may be used to request a project ${major} review and design grade (request in two separate issues).`);
          }
          else {
            core.notice(`✅ The release ${release} may be used to request a project ${major} design grade. This grade only needs to be requested once.`); 
          }
        }
        else {
          output.request_review = true;

          if (minor < 2) {
            output.grade_review = true;
            core.notice(`✅ The release ${release} may be used to request a project ${major} code review appointment and review grade when that appointment is complete.`);
          }
          else {
            core.notice(`✅ The release ${release} may be used to request a project ${major} code review appointment.`);
          }
        }
      }
      else {
        core.notice(`❌ The release ${release} cannot be used to request a project ${major} code review, review, or design grade because of the style checks.`);
      }

      // TODO
      // there should be benchmark output 
      // if (major >= 3) {

      // }
    }
  }
  catch (error) {
    core.info(`${error.name}: ${error.message}`);
    core.setFailed(`Could not fully verify results of the ${release} release.`);
  }
  finally {
    fs.writeFileSync(output.filename, JSON.stringify(output));

    core.startGroup('Setting output...');
    for (const property in output) {
      core.info(`${property}: ${output[property]}`);
      core.setOutput(property, output[property]);
    }
    core.endGroup();
  }
};