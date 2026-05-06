#!/bin/bash

code() {
    printf "\033[1;36m%s\033[0m" "$1"
}

echo
git log --oneline -1
echo

read -p "Test current commit? [Y/n] " answer
if [ "$answer" = "n" ] || [ "$answer" = "N" ]; then
    echo
    echo "git bisect start"
    echo "git bisect bad            # marks current HEAD as bad"
    echo "git bisect good <commit>  # marks the last known good commit"
    echo
    read -p "Do you want to start the bisect from this commit? [Y/n] " answer2
    if [ "$answer2" = "n" ] || [ "$answer2" = "N" ]; then
        exit 1
    fi
    git bisect start
    git bisect bad
    echo
    git log --oneline -20
    echo
    read -p "Enter the last known good commit: " GOOD
    git bisect good $GOOD
    echo
    echo -e "Bisect has started. You can alway abort it with $(code "git bisect reset")."
    echo
    echo "We will now build and execute the code."
    echo "Verify the result, then press Ctrl-C."
    echo "If the result is good, type $(code "git bisect good")."
    echo "Otherwise type $(code "git bisect bad")."
    echo "In both cases, just type $(code "./bisect.sh") to start the next step."
    echo
    git log --oneline -1
    echo
    read -p "Press [ENTER] when ready..."
    echo
fi

cd lib
npm install
npm run build

cd ../doc
npm install
npm start
