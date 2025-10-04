# AudioNotes — AI-powered audio notepad
Status: #working project. Microphone recording, uploading to Supabase, automatic transcription, and short AI summaries are working. Live transcription (during online meetings) is currently being developed.
What it is
A web application for quickly creating audio notes: record your voice or the audio from a meeting tab, and the system transcribes what is said and generates a short summary in the same language. All files and notes are stored in Supabase.
Features
Recording from a microphone (/record page)
Auto-transcription of audio and AI summary in the same language
Live recording of a meeting from a browser tab + optional microphone (/live page) — WIP
List of notes and note details (/notes, /note)
Storage: Supabase Storage (audio bucket) + public.notes table
Support for any language (auto-detection in transcription)
Where it is useful
Interviews, meetings, stand-ups
Lectures, webinars, training sessions
Voice diaries, field notes
Preparation of notes, meeting summaries, follow-up letters
Technologies
Lovable (UI + Server Actions)
Supabase (Postgres, Storage)
OpenAI (transcription and summarization)

## Project info

**URL**: https://lovable.dev/projects/1b08cce1-092c-476c-9454-ef208e7823c4

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/1b08cce1-092c-476c-9454-ef208e7823c4) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/1b08cce1-092c-476c-9454-ef208e7823c4) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
