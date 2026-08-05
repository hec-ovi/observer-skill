# Choosing what to draw

The toolkit is on. You have the concept list and, if research ran, the notes. Now decide
what earns a visual, before the user presses play. Nothing here is about how to build one;
that is `artifact-authoring.md`. This is only the judgement.

## A visual earns its place when the audio cannot carry the shape

Speech is a series. Anything that is not a series loses information on the way to the ear:

- **An equation** whose terms interact. Not the equation rendered as an image, which the
  user could have read: the terms moving. Slide the parameter, watch the curve change,
  watch the term that dominates take over.
- **A system** with more than three parts, or with a loop. A pipeline, a handshake, an
  attention pattern, a feedback controller. The speaker described it in order because they
  had no choice. You do have a choice.
- **A magnitude** the speaker states and the listener cannot feel. "Billions of tokens",
  "microseconds", "ten orders of magnitude". Put it on an axis next to something the user
  knows.
- **A distribution or a trade-off**. Anything with a shape, a tail, a knee, a frontier.
- **An algorithm** that runs. Step it, one operation at a time, on an input small enough
  to follow.

## A visual is wrong when

- The point is a fact, a date, a name, or a definition in words. Draw nothing.
- It would restate the speaker's own slide. The user is already looking at it.
- It needs invented data. Never draw numbers the video did not give and your research did
  not find. A plausible-looking chart of made-up values is the worst thing you can put on
  that screen. If the shape matters and the values do not exist, draw the shape, label the
  axes qualitatively, and pass `caption: 'Values are illustrative'` to `build`. The caption
  is drawn under the title, so the user reads it with the chart.
- One visual would cover four concepts. That is four visuals, or one concept you mapped
  wrong.

## One idea per artifact

If you cannot say what a visual proves in one sentence, it is two visuals. A concept can
have several: the equation's geometry, then the same equation as a function of the one
parameter that matters, then where it breaks. Each is separately shown, separately named,
separately understandable.

## Narration when the visual has to be walked through

A visual can carry `narration`: a line or two you write now, which the page speaks in the
user's voice when the visual is shown. It earns its place when the visual is a process the
user has to be walked through while they watch it move, step by step, and the audio of the
video is not doing that for them. It does not earn its place as the caption read aloud, as a
description of what is already on screen, or on a visual the user takes in at a glance. Most
visuals carry none.

## Interactive when interaction is the explanation

Add a control only when moving it is the insight. A slider on the parameter that the whole
argument turns on, yes. A tooltip on every point, only if the values are the point. A
legend the user must click to see anything, no.

## Imaginary representations

The user asked for these explicitly: a complex system explained through a simple one. A
cache as a desk with limited space. Gradient descent as a walk downhill in fog. Do it when
the analogy is exact enough to survive being pushed on, and label it as an analogy on the
artifact itself. An analogy that breaks silently teaches the wrong model.

## Order of work

Build in the order the video hits them, so if preparation is cut short the early minutes
are covered. Within that, the equations and systems first: they are the ones that stop
people.

## Binding

Every artifact is linked to its concept and its time range. That is how it reaches the
user at the moment it means something. An artifact linked to nothing will never be shown.
