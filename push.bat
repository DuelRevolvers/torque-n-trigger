@echo off
rem Commits all changes (Archive/ is excluded by .gitignore) and pushes to GitHub.
cd /d "%~dp0"

git status --short
git diff --quiet && git diff --cached --quiet && (
  git ls-files --others --exclude-standard | findstr . >nul || (
    echo Nothing to commit.
    pause
    exit /b 0
  )
)

set "MSG="
set /p "MSG=Commit message (Enter for 'Update'): "
if "%MSG%"=="" set "MSG=Update"

git add -A
git commit -m "%MSG%" || (pause & exit /b 1)
git push || (pause & exit /b 1)
echo Done.
pause
