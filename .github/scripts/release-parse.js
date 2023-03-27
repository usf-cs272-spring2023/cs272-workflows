module.exports = async ({github, context, core}) => {
  // set the release ref from input or from event
  let release_ref = undefined;
  let release_id = undefined;
  let release_date = undefined;

  switch (context.eventName) {
    case 'release':
      release_ref = context.ref;
      release_id = context.payload.release.id;
      release_date = context.payload.release.created_at;
      break;

    case 'workflow_dispatch':
      try {
        const response = await github.rest.repos.getReleaseByTag({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag: context.payload.inputs.release_tag
        });

        if (response.status !== 200) {
          throw new Error(`Status ${response.status}`);
        }

        release_ref = `refs/tags/${response.data.tag_name}`;
        release_id = response.data.id;
        release_date = response.data.created_at;
      }
      catch (error) {
        core.setFailed(`Unable to fetch release ${release_ref} (${error.message}).`);
        return;
      }

      break;

    default:
      core.setFailed(`Unexpected event type for parsing release: ${context.eventName}`);
      return;
  }

  core.info(`Using release reference: ${release_ref} (id ${release_id})`);

  // parse release ref into parts
  const regex = /^refs\/tags\/v([1-4])\.(\d+)\.(\d+)$/;
  const matched = release_ref.match(regex);

  // cannot continue without a parsable version number
  if (matched === null || matched.length !== 4) {
    core.setFailed(`Unable to parse "${release_ref}" into major, minor, and patch version numbers. If a release was made in error, delete the release *and* tag (2 separate steps).`);
    return;
  }

  const out = {};
  out.version_major = parseInt(matched[1]);
  out.version_minor = parseInt(matched[2]);
  out.version_patch = parseInt(matched[3]);

  out.release_tag  = `v${out.version_major}.${out.version_minor}.${out.version_patch}`;
  out.release_ref  = release_ref;
  out.release_id   = release_id;
  out.release_date = release_date;

  let test_patch = out.version_minor;
  let limit = 1;

  // handle project 3 special cases
  if (out.version_major == 3) {
    limit = 2;
  }

  if (out.version_minor > limit) {
    test_patch = 'x';
  }

  out.test_number = `v${out.version_major}.${test_patch}`;

  // output and set result
  core.startGroup('Setting output...');
  for (const property in out) {
    console.log(`${property}: ${out[property]}`);
    core.setOutput(property, out[property]);
  }
  core.endGroup();

  // update release with run information
  // don't need to wait for result!
  github.rest.repos.updateRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    release_id: release_id,
    body: `:octocat: See [run #${context.runNumber} (id ${context.runId})](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) for details.`
  });

  return out;
};
