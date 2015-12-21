#!/bin/bash

# This is almost entirely taken from
# <http://www.steveklabnik.com/automatically_update_github_pages_with_travis_example/>.

echo blah3.1

set -o errexit -o nounset

#cd subdirectory

#git init
git config user.name "$(git log -1 --pretty=%an HEAD)"
git config user.email "$(git log -1 --pretty=%ae HEAD)"

echo blah3.2

git remote add rocketnia-upstream "https://$ROCKETNIA_GH_TOKEN@github.com/rocketnia/era.git"
git fetch rocketnia-upstream
git reset rocketnia-upstream/gh-pages

echo blah3.3

node build-era.js -pms

echo blah3.4

touch .

git add -A .
git commit -m "$(git log -1 --pretty=%B HEAD)"
git push -q rocketnia-upstream HEAD:gh-pages

echo blah3.5
