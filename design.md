# Cartograph interface

The interface is a dense developer workspace. A Swiss grid gives it clear panel
boundaries and compact labels. The project rules govern the palette and type:
neutral surfaces, a blue interaction accent, Geist body text and Geist Mono for
paths and identifiers. No decorative texture, shadows or automatic motion.

## Build mandate

The header holds the team switcher, invitations, theme and account controls.
The organization identifier directly below it comes from the server session.
The desktop workspace has a repository panel on the left, the dependency map
in the center and file details above repository questions on the right.
On smaller screens the right panels move below the map. On narrow phones the
panels stack. Empty panels state what is absent and never show invented data.

Use small type, tight spacing and thin borders. Keep standard action names.
The root element records System, Light or Dark, with explicit choices taking
precedence over the system preference. Tokens and responsive rules live in
`app/globals.css`.
