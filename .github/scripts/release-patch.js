// checks the releases to determine if the patch number makes sense
module.exports = async ({github, context, core}) => {
  const major = parseInt(process.env.VERSION_MAJOR);
  const minor = parseInt(process.env.VERSION_MINOR);
  const patch = parseInt(process.env.VERSION_PATCH);
  const release = `v${major}.${minor}.${patch}`;

  core.info(`Release: ${release}, Project: ${major}, Review: ${minor}, Patch: ${patch}`);

  if (patch > 0) {
    const previous = `v${major}.${minor}.${patch - 1}`;

    try {
      const response = await github.rest.repos.getReleaseByTag({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag: previous
      });

      // an error is thrown for 404 not found
      // if make it this far, the tag was found
      core.info(`Found ${previous} release...`);
    }
    catch (error) {
      core.info(`${error.name}: ${error.message}`);
      core.setFailed(`You must have a ${previous} release before creating a ${release} release. You may want to delete the ${release} release *and* tag (two separate steps).`);
    }
  }
  else {
    try {
      const response = await github.rest.repos.listReleases({
        owner: context.repo.owner,
        repo: context.repo.repo,
        per_page: 100
      });

      if (response.data.length >= 100) {
        core.error(`Maximum number of releases exceeded. Results may be unreliable.`);
      }

      const filtered = response.data.filter(x => x.tag_name.startsWith(`v${major}.${minor}`));
      core.info(`Found: ${filtered.map(x => x.tag_name).join(', ')}`);

      if (filtered.length === 1 && filtered.shift().tag_name === release) {
        core.info(`Found no v${major}.${minor}.# releases other than ${release}...`);
      }
      else {
        core.setFailed(`You should not have other releases that start with v${major}.${minor} when using a 0 patch number. You may want to delete the ${release} release *and* tag (two separate steps).`);
      }
    }
    catch (error) {
      core.info(`${error.name}: ${error.message}`);
      core.setFailed(`Unable to check patch version of the ${release} release.`);
    }
  }
};