// parses the issue title and body for request details
module.exports = async ({github, context, core}) => {
  const error_messages = [];
  const output = {};

  try {
    const title = context.payload.issue.title; 
    const body = context.payload.issue.body;
  
    // parse issue title
    switch (title) {
      case 'Request Project Tests Grade':
        output.request_type = 'grade_tests';
        break;

      case 'Request Project Review Grade':
        output.request_type = 'grade_review';
        break;

      case 'Request Project Design Grade':
        output.request_type = 'grade_design';
        break;

      case 'Request Project Code Review':
        output.request_type = 'request_review';
        break;

      default:
        error_messages.push(`Unable to determine request type from issue title: ${title}`);
    }

    // parse issue body 
    // const json_regex = /```json([^`]+)```/;
    const pattern = /^### Full Name\s+([^\n]+)\s+### USF Email\s+([^\n]+)\s+### Release\s+([^\n]+)\b\s*$/;
    const matched = body.match(pattern);

    if (matched === null || matched.length !== 4) {
      console.log(matched);
      error_messages.push(`Unable to parse details from issue body.`);
      return; // don't continue try block
    }

    output.name = matched[1];
    output.email = matched[2];
    output.release = matched[3];

    // const parsed = JSON.parse(json_match[1]);
    // console.log(`Parsed: ${JSON.stringify(parsed)}`);

    // trim all of the values and save as output
    // Object.keys(parsed).forEach(key => parsed[key] = parsed[key].trim());
    // Object.assign(output, parsed);

    // check for valid name
    // if (!parsed.hasOwnProperty('name') || parsed.name == "FULL_NAME") {
    //   error_messages.push(`The "name" property must be present and filled in with your full (first and last) name.`);
    // }

    // check for valid user
    // if (!parsed.hasOwnProperty('user') || parsed.user == "USER_NAME") {
    //   error_messages.push(`The "user" property must be present and filled in with your USF username.`);
    // }

    // check for valid release
    // if (!parsed.hasOwnProperty('release') || parsed.release == "v0.0.0") {
    //   error_messages.push(`The "release" property must be present and filled in with a valid release.`);
    // }
    // else {
      // attempt to parse the release
      const tag_regex = /^v([1-4])\.(\d+)\.(\d+)$/;
      // const tag_match = parsed.release.match(tag_regex);
      const tag_match = matched[3];

      if (tag_match === null || tag_match.length !== 4) {
        error_messages.push(`Unable to parse "${parsed.release}" into major, minor, and patch version numbers.`);
      }
      else {
        output.version_major = parseInt(tag_match[1]);
        output.version_minor = parseInt(tag_match[2]);
        output.version_patch = parseInt(tag_match[3]);
        output.release_tag  = `v${output.version_major}.${output.version_minor}.${output.version_patch}`;
      }
    // }
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

      core.setFailed(`Found ${error_messages.length} problems while parsing the request.`);
    }
  }
};