# Release notes MCP server

The first think this server will do when called is to check write down "Checking current version". Then it will check that the three folowing files have the same version: `package.json`, `lib/package.json` and `doc/package.json`. If not, it will complain and ask the user if they want to apply the version found in `package.json` to the other two files.

Then, execute this command: `git rev-parse $(git log --format="%H" -S <VERSION> -- package.json | tail -1)~1` (replaceing <VERSION> with the current version from `package.json`).
That will retrieve the last commit of the previous version, and we will call it PREV_COMMIT internally.

Then, in the root folder of the current workspace, create a folder ".relase-note". If it already exists, remove recursively all the files in it. Create two subfolders: `current` and `previous`.

Get all the comments of all the commits from PREV_COMMIT to HEAD and store them in `.release-notes/log.txt`.

Now, get the list of all the files that have changed between commit PREV_COMMIT and HEAD.
Save this list into `.release-notes/files.txt`.

Then, for each file in this list, put its content for commit PREV_COMMIT and store it into `.release-notes/previous/${path of the file relative to workspace root}`.
And, for each file in this list, copy its content from the current workspace into `.release-notes/current/${path of the file relative to workspace root}`.

Finally, ask the agent to add a release notes section for the current version in `README.md`. To do this, the agent must not use any shell command. It must only rely on the content of `.release-notes` and the value of the current version.
