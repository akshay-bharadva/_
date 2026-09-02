I would like to mention few issues,

> **Status legend** — `[x]` resolved, `[~]` partially resolved, `[ ]` pending.
> The original feedback below is kept verbatim; status and implementation notes
> are appended to each item. The analysis behind every item, and the phase order
> the work runs in, is in `docs/redesign/v3-qa-plan.md`.


1. on main home page, I didnt like the Hero section so when the status panel is not shown the right section looks empty, previously it used to center the hero section centered align - I want you to redesign that section with design brainstroming

**`[x]` Resolved.** The grid was unconditional — `lg:grid-cols-[1.35fr_1fr]`
rendered whether or not the status panel did, so switching the panel off left
the text at 57% width beside a column that was still there and simply empty.
Two deliberate compositions now: the asymmetric band with the panel, and one
column across the full measure without it. Centring was the other candidate and
is rejected on the v3 rule that a full-width block of text is not centred — at
display size a centred name over a left-aligned paragraph pulls the eye along
two axes.

2. on Home, page I didn't like the Contact CTA - like the banner is good but I should have better design and visibility with few theme the UI/coloring system is off

**`[x]` Resolved — and the "colouring is off" was measurable.** `band-accent`
is `hsl(var(--accent) / 0.35)` over the page background, and every piece of
text on it was `--foreground`/`--muted-foreground`. No test covers that pair:
`theme-contrast.test.ts` gates `accent` against `accent-foreground`, a
different colour. Composited and measured over the 52 presets, the real pair
**fails WCAG AA on 31 of them** — `muted-foreground` down to 2.10:1 on
cyberpunk, and `foreground` itself failing on solarized-light, onedark-pro and
monokai.

Re-tinting would trade a failure on pale presets for one on dark presets, so
the content moved onto a `Surface` instead: its ground is `--card` and its text
`--card-foreground`, which *is* gated everywhere. The band keeps its accent
weight so it still reads as the end of the page, and visibility now comes from
elevation, which is a fixed shadow and therefore identical on all 52 presets.
Hierarchy tightened too — the email link was a second elevated card competing
with the primary action, and is now a quiet inline link.

3. on about page, I asume there is grid section for profile pic and about info, so when the profile is not shown the about description is in profiles's grid container in single long column brainstrom on the design and see how can you make it better UI/UX and over all functionality

**`[x]` Resolved.** Same root cause as item 1. `sm:grid-cols-[8rem_1fr]` was
unconditional while the picture was optional, so with no picture the bio still
rendered into the *second* column and the first stayed an empty 8rem gutter —
the text began a third of the way across for no visible reason. The column now
exists only when there is a picture, including the case where the switch is on
but the URL is empty.

4. for section renderer section, I didn't like the timeline UI/UX the design is off and it's not aligned properly I want something like github commit/branch timeline structure - I should be able to clearly see the timeline, if some process overlaped (like similar to parallel branching and merging) - brainstrom and make something like that

5. for blog page, public, the table of content is off with the blog content, I can scroll down to the page but some title in TOC is not highlighed even when I click on TOC title the blog scrolls to that but it's not higlighted.

6. in updates after all notes I need "--that's all for now--" in script/design font centered align - also the font for date and #tags I want script and intead of dotted line I want solid line in card - do brainstrom for design

7. on contact page, if I don't have any social link then the direct link title is still available with no social link also if the avalability and social is not there the form should be full legth, also check the layout for all three permutation and combinations, brainstrom the contact page for orders of the section what to visible locially and actually with what parts and all

**`[x]` Resolved, with an IA change rather than only a fix.** Three things were
wrong: the "Direct lines" heading rendered over an empty list; a link whose URL
`safeLinkUrl` rejected still counted as a link and rendered as an invisible row
under that heading; and `lg:grid-cols-[3fr_2fr]` was unconditional, so with no
links and no badge the form sat at 60% of the band beside nothing.

On the order: availability moved out of the aside to directly under the page
heading. It is context for the whole page — whether writing is worth it at all
— and in the old source order a phone reader met the entire form before
reaching it. The grid is then chosen from what exists: form plus links is two
columns, either one alone takes the band, and with the form off the links
become a two-up grid rather than very wide single rows.

8. admin, when I'm on main admin dashboard page the dashboard link is not with active coloring

**`[x]` Resolved.** `trailingSlash: true` makes `usePathname()` report
`/admin/`, so the `pathname === href` comparison failed — and `/admin` is
deliberately excluded from the prefix fallback, since every module path begins
with it. Dashboard was therefore the one entry that could never be active, and
`activeNavItem("/admin/")` returned undefined, which also left the document
title wrong on that screen. The rule existed twice with the same two bugs; there
is now one `isActiveNavHref`, which also fixes segment-boundary matching so a
future `/admin/blog-drafts` cannot light up Blog.

9. on admin/content, Pages section, the div with Items and add item button have different bg coloring which is off and clearly visible - check that out

10. same UI issue in blog post edit view, take a reference of medium, dev.to and substacks bloging flow system and restructure the Blog components - also when the blog is long the tool bar is not sticking up it scrolls with the editing box

11. in updates, it seems like the table/list view is old and other components are new sync the list/table with current new UI/UX

12. on Navigation, when I created new link say /ABCD it show correctly in navigation that this will be CMS page, it also shows on public nav bar but when I vist that it says 404.

**`[x]` Resolved.** Not a bug in the resolver — `generateStaticParams` runs at
build time with `dynamicParams = false`, while the navigation is fetched at
runtime. A page created after the last deploy is therefore in the site's own
menu of a build that has no HTML for it. That is what `output: "export"` means,
and generating more routes cannot fix it.

GitHub Pages serves `404.html` for any unmatched path, which makes it the one
place a static export can still decide about a URL. The 404 page now asks the
navigation whether a visible link claims the path and renders the same
`CmsPage` if so. Verified in a real build: `404.html` prerenders the loading
skeleton and contains no "404" text at all, so there is no error flash before
the resolver runs. The admin's Navigation row now also says a CMS page works
immediately and is built in at the next deploy.

13. in assets section, take a look at google drive functionality, currently the upload section is very small not full screen, also when I drag and drop to the assets the "drop the upload to assets folder" is flickering containuosly, also I should be able to drag and drop move from root to and folder that is visible, similar to Drive - Througly research and brainstrom on it and then implement

14. for inbox setting the UI should be like Outlook - sort by new first and the UI/UX should be similar

15. for discover, in money and market it;s only showing BTC & ETH no I don't want that and there is on banner with srock indices are not shown, intead is there any way we can watchlist some stock/MF/ETF we can search it and if we find the result we can watchlist and maintain watchlist; in career tab, the only career is list from germany and other but I'm in NA also I want carrer fulltime/parttime/freelance all aspect of things; for What happened tab, it seems goog to me but I know for sure that you can do much better - take full responsiblility of discover module throught research and analyse world web and reconstruct the mosule.
Recently I'm more interested in reading aartficle which is most popular. Like I have mostly read substack articlers with more than 30K likes and most reshared. Can we do something like that 

15. for tasks, every thing is good - expect when i click on task it directly opens the editing ppanel intead I want a view first then edit if user wants to, also in projects the listed projects is always editable

16. for habit, I don't look it personalized, it's not that lured section that can attract me to come to habit section, all the functionality and everything is awesome but it's not able lured me to it.

17. for learning module it's good compare to previous one but, let's say if there are module subtopic it's always not the flashcard that can be read all along in review system, right? I need solid learning module, that can change my nuroplasticity and help me become knowledable. and help me study and prepare for certifications for career.

18. in calander if there are multiple all day event or habit it's overlapping the UI, like it's not showing side by side.

19. for notes, if there is not title then don't show untitled. LOL. Also, I just pinned and it just says last modified min ago. is that will be the case?

20. in whiteboard, should I be able to rename whiteboard from listed whiteboard view or it just should be from boardview page, also if I just opened the existing page and I have not made any change and click on close it shouln't be asking to discard, it doen't make any sense.

21. in finance, there should be reveal/unreveal button, right? for numbers. Also in recurring form there is category text box which should be category dropdown similar to txn form; in activity tab: there are two add button which is redundant. In category creating category make sense but I didn't understand the need,income,etc.. in category how it'll help and how can I benfit from it. Also in goals, if I'm adding money it should ask me from which account you want to add to goal, from goal it should not only add some time in emergency we have to remove/take from it. also on budgeting I didn't understand the calculation on pace of $XXXX, ahead of pace. For forecast, I didn;t got the commitment only thing also when I did something on whatif scenario it showed  this is a consequence of the what ifs belows, not your current plan banner why it came in that only scenario, rest of the scnario is okay. Also What can be done to see forecast for further far future let's say 5 year, 7 year. I want to see that as I'm taking mortgage in india of about 50 lakh ruppes.

22. for Settings, for preview I want same exact preview as the actual website, not few components.

23. after all of these changes I want you to make a admin side bar layout instead of sidebar to google options, like google have 9 dots on top right beside the profile button from where we have access to all google applications.