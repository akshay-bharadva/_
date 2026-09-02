# v3 — Admin interaction standard

Styling is not the problem this document solves. Every admin module was
assembled independently, so each invented its own answer to the same handful of
interaction questions. The result reads as unfinished regardless of how it is
painted.

This is the contract every module follows. A module that needs to break a rule
here should say why in a comment at the point of departure.

## 1. One primary action, in one place

The module's primary action lives in the page header and **nowhere else**.

> Content had a "New Section" button in the page header _and_ a second
> full-width one inside the list column, about 200px apart. Two buttons for one
> action is the clearest signal that a screen was assembled rather than
> designed.

Secondary actions belong to the object they act on (a row's menu, a card's
overflow), never duplicated at page level.

## 2. Model the object the owner thinks in

The primary object of a module is the thing the owner would name if asked what
they were doing. Not the thing the database happens to key on.

> Content is authored as _pages_: "what's on my About page?". The module made
> _sections_ primary and reduced pages to an accordion grouping, so there was no
> way to see or manage a page as a thing, and creating a section meant choosing
> its page from a combobox as an afterthought.

## 3. Creating something selects it

After a create succeeds, the new record becomes the current one — selected,
scrolled to, and ready to edit. Closing the form and returning the user to an
unchanged list makes them hunt for what they just made.

## 4. Master and detail, one mental model at every width

A module shows a **list**. Opening a record replaces the list with a **detail
view** that has a back control in a fixed, predictable place.

Not: a two-pane split on desktop that becomes a takeover on mobile, with an
empty right-hand pane as the resting state. That is two designs to learn, and
the desktop resting state wastes the larger half of the screen on a placeholder.

## 5. The page scrolls; panes do not

No `h-[calc(100vh-13rem)]`. Viewport arithmetic breaks the moment the header
changes height, and it produces nested scroll regions that fight the page
scrollbar and trap the keyboard.

## 6. Editing depth stops at two

List → detail → **side sheet** for a single record's fields. A sheet opened on
top of a detail that is itself inside a pane is three levels deep for editing
one bullet point.

## 7. Ordering is explicit and its scope is visible

Reorder controls are always visible on the row, never revealed on hover — hover
does not exist on touch, and hover-only controls are invisible to keyboard
users. The UI must state what the ordering is _within_ (a page, a section).

## 8. Status is stated once

Counts, filters and search live together in one bar directly above the thing
they filter. Not split between a page-header description and a control inside a
card.

## 9. Destructive actions confirm; every mutation reports

Confirm dialog for delete, always. Toast on success and on failure. This one was
already consistent and stays.

## 10. Loading, empty and error are designed states

Every list renders a `LoadingState`, an `EmptyState` with the primary action,
and an error state with a retry — not a bare spinner and a blank region.
