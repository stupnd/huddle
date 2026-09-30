# Huddle

Group trip planning app that lives inside iMessage. An AI agent joins your group chat, listens to the conversation, and helps coordinate the trip -- tracking each person's preferences, surfacing conflicts, and maintaining a shared dashboard of where the plan stands.

## Stack
- Frontend: React (Vite)
- Messaging: Claw Messenger (iMessage provider)

## Design Direction
- Modern, clean, startup-quality
- Target audience: 20-somethings planning group trips with friends
- Tone: fun but trustworthy, not corporate
- Tagline: "made by girls who just wanna have fun"

## Key Features
- AI agent in iMessage group chat (speaks up when needed, not on every message)
- Dynamic child agents that can join the chat for specific tasks
- App dashboard showing each person's preferences and trip status
- Trip history view

## Conventions
- Use TypeScript strictly
- Tailwind CSS for styling
- Components in src/components/, pages in src/pages/
- Keep components small and composable
- Use semantic HTML and ensure basic accessibility (aria labels, keyboard nav)
- No em dashes in any copy or text
