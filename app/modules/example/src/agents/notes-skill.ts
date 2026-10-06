import { skillFromContent } from "@core/agents";
import { EXAMPLE_NOTES_SKILL_ID } from "../capabilities.ts";

// A string, not a SKILL.md file: `mastra build` bundles code only, and a module has no asset copy step.
const NOTES_SKILL = `---
name: ${EXAMPLE_NOTES_SKILL_ID}
description: How to take and archive notes for the user with the example module - short titles, confirmed text, one command per note, and what an archive approval means.
---

# Example notes

Use this skill when the user asks to write down, save, keep or archive a note.

## Creating a note

- A note has a short title (at most 200 characters) and an optional text.
- Propose the title and the text, and wait for the user's confirmation or a submitted form.
- Run \`command.example.CreateNoteCommand\` once per confirmed note, with exactly the confirmed values.
- Never put secrets, passwords or tokens in a note; say so and leave them out.

## Archiving a note

- Archive only a note the user named by its id; never guess an id.
- \`command.example.ArchiveNoteCommand\` needs a second member's approval. Its result is then
  \`pending-approval\`: say that the note is still active and that another member must approve.

## After

- Report the note id from the command result, or say that nothing was saved.
`;

/** The module's Agent Skill, shown only to organizations that enabled the module (decision 0029). */
export const exampleNotesSkill = skillFromContent(NOTES_SKILL, EXAMPLE_NOTES_SKILL_ID);
