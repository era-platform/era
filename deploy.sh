#!/bin/bash

# Build the `main` branch, and deploy it to the `gh-pages` branch.

# This is adapted from
# <http://www.steveklabnik.com/automatically_update_github_pages_with_travis_example/>.

# If there's an error during any command, exit the script. If any
# unset environment variable is used, exit the script.
set -o errexit -o nounset

# We only proceed if this deployment was triggered by a commit to
# `main`.
test "$TRAVIS_PULL_REQUEST" == "false" || exit 0
test "$TRAVIS_BRANCH" == "main" || exit 0

# We're going to make a commit to the gh-pages branch that looks a lot
# like the current commit on `main`.
git config user.name "$(git log -1 --pretty=%an HEAD)"
git config user.email "$(git log -1 --pretty=%ae HEAD)"
message="$(git log -1 --pretty=%B HEAD)"

# Without changing the state of the working copy, we reset to the
# `gh-pages` branch on GitHub. If the branch doesn't exist, we proceed
# anyway (`|| true`); we'll end up creating the branch ourselves.
git remote add era-platform-upstream \
  "https://$ROCKETNIA_GH_TOKEN@github.com/era-platform/era.git"
git fetch -q era-platform-upstream
git reset era-platform-upstream/gh-pages || true

# We build the dependencies of the Era demos. We replace the
# `.gitignore` file with a version where these dependencies are not
# ignored.
echo Building dependencies of the Era demos...
node build-era.js --minify --build-penknife --build-staccato
cp gh-pages.gitignore .gitignore
echo Finished building dependencies of the Era demos.

# TODO: The original does this "so that `git` considers all of our
# local copies fresh." See if we need to do this.
#touch .

# Commit all differences, including untracked files, to the `gh-pages`
# branch. We specify the remote branch as `refs/heads/gh-pages` so
# that this creates the branch if it doesn't exist yet.
git add -A .
git commit -m "$message"
git push -q era-platform-upstream HEAD:refs/heads/gh-pages
