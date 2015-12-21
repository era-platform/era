#!/bin/bash

# This is almost entirely taken from
# <http://www.steveklabnik.com/automatically_update_github_pages_with_travis_example/>.

set -o errexit -o nounset

#cd subdirectory

#git init
git config user.name "$(git log -1 --pretty=%an HEAD)"
git config user.email "$(git log -1 --pretty=%ae HEAD)"

echo blah1

git remote add rocketnia-upstream "https://$ROCKETNIA_GH_TOKEN@github.com/rocketnia/era.git"
git fetch rocketnia-upstream
echo blah2
git reset rocketnia-upstream/gh-pages || true

echo blah3

node build-era.js -pms

touch .

git add -A .
git commit -m "$(git log -1 --pretty=%B HEAD)"
git push -q rocketnia-upstream HEAD:gh-pages
