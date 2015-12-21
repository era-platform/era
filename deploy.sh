#!/bin/bash

# This is almost entirely taken from
# <http://www.steveklabnik.com/automatically_update_github_pages_with_travis_example/>.

set -o errexit -o nounset

#cd subdirectory

#git init
git config user.name "$(git log -1 --pretty=%an HEAD)"
git config user.email "$(git log -1 --pretty=%ae HEAD)"

message="$(git log -1 --pretty=%B HEAD)"

git remote add rocketnia-upstream "https://$ROCKETNIA_GH_TOKEN@github.com/rocketnia/era.git"
git fetch rocketnia-upstream
git reset rocketnia-upstream/gh-pages || true

node build-era.js -pms
cp gh-pages.gitignore .gitignore

touch .

git add -A .
git commit -m "$message"
git push -q rocketnia-upstream HEAD:refs/heads/gh-pages
