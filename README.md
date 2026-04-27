# Humanview

A smart, lightweight code-review tracking engine built natively for VS Code. 

Humanview allows you to quickly mark, categorize, and navigate through code sections during code reviews, audits, or complex refactoring sessions. Say goodbye to losing your place while reviewing massive files.

## Features

* **Visual Code Marking:** Instantly color-code contiguous blocks of code directly in your editor's gutter.
* **Block-by-Block Navigation:** Jump instantly between marked sections without manually scrolling through hundreds of lines.
* **Smart Edit Tracking:** The tracking engine actively listens to your keystrokes. Marks shift dynamically as you add or delete lines, and automatically clear themselves when a line is edited.
* **Workspace Explorer:** A dedicated sidebar panel providing a bird's-eye view of all files currently marked for "Review" or "Problem" across your entire workspace.

## Keyboard Shortcuts

Highlight a block of code (or just place your cursor on a line) and use the following:

| Command | Shortcut (Windows/Linux) | Shortcut (Mac) | Color |
|---------|-------------------------|----------------|-------|
| **Mark as Verified** | `Ctrl + Shift + V` | `Cmd + Shift + V` | Green |
| **Mark for Review** | `Ctrl + Shift + R` | `Cmd + Shift + R` | Yellow |
| **Mark as Problem** | `Ctrl + Shift + X` | `Cmd + Shift + X` | Red |
| **Clear Mark** | `Ctrl + Shift + C` | `Cmd + Shift + C` | None |
| **Workspace Summary** | `Ctrl + Shift + S` | `Cmd + Shift + S` | - |
| **Next Mark Block** | `Ctrl + Shift + Down` | `Cmd + Shift + Down` | - |
| **Prev Mark Block** | `Ctrl + Shift + Up` | `Cmd + Shift + Up` | - |

## Extension Settings

This extension currently contributes no specific settings, keeping your environment perfectly clean. Just install and start reviewing.