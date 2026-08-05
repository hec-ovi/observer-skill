musty be professional and correctly splitted into responsibilities.
is a skill, make sure the SKILL.md is repeated and present wherever it has to as in websearch-skill or research-skill projects.
learn about pocket-tss because we will be using it for voice, we need also sst, check simulacrunium approach on how to capture voice.

i want simple thing, all in a single thing,if this can be an mcp even better, have in count will serve a page, so... i think it could be a node server serving also the mcp and the frontend we need all into a single unified service.

the page is the next i paste a video which is a podcast.
i feed it, so the system transcript it.
i see the video inside our serving html.
i can pause the video whenever i want, the agent must know in which part of the video i am (agent will have the transcription)

whats the end user experience?
- i load a video/podcast/tutorial/guide that might be highly complex about a topic.
- i optionally provide a prompt of things i want in there, explaination of complex topics or definitions, hihly important because:
  - i might want the model to create charts with interactive models moving and algorithms.
  - big data visualizations
  - imaginery representations to explain complex ecuations or systems through simple concepts.
- based on the prompt i pvoided and instructions, the agent first will read the whole transcript and prepare all the charts and graphics needed.
- and then the session itself (is an educative tool):
once i finished pointing the video, where this video were feeded its whole transcript, and the agent from a prompt extracted all technical deifnitions, and for each part that involves a mathematic ecuation or engineering system, will for that concept/section create one or many different simple charts to explain it, can even make automated voices explaining in parts.
Then the user start seeing the video, and pauses wherever he has a doubt, when the user has a doubt, the agent is in fast-mode and must, answer the doubt directly (the agent here must have in context the whole transcript PLUS any extra research he did for the whole session) will answer.
This means the iframe of youtube inside the application must detect position and that position must be associated with the transcript so the agent knows what the user is asking, in which context and about what. From there the user can ask to visualize a chart or something to understand more deeply the question or even follow up questions.
This conversation is through the CLI as a skill, so the agent is receiving all this from the MCP, which will be inside the webpage serving, and the CLI can use elements and spawn elements (check agentickit i solved this in there).

exta requirements:
light/dark/system template (works in charts and everything).
Soft transitions from video to charts or elements the agent created.
settings to select voice of the agent, and text speech to text (text to speech happens with hold and release button, in both application and settings).
a toggle enable/disable extra knowledge (meaning the agent will use web search once finished the transcription phase)
so phases should be (with a nice loader) feed video -> transcript -> (optional) extra step for websearch concepts of the transcript -> (optional) extra toolkit such as charts, big data visuals, interactive elements -> start session.

We want an excellent prompt for this, and an excellent toolkit for all this, this means i want a prompt that explains the video in some cases have ads inside (this might generate noise) in order to litigate this, user can also select this video have ads, or leave it off, what this does is explain in trhe prompt to the agent that in transcription, that transcription might have in parts of the video ads.
Extra prompts, agent must have ready a list of jargon technical concepts to fast-iterate and explain, the idea of this is real time, is why, in the moment of the visuals, the agent must answer quickly as possible, is why transcription, websearch, preparation of concepts and charts is so importan, so in the moment this is needed it happens fast (NEVER code in a question meaning rule, so if something is not ready and user asked simply answer in text).

The agent in each stage musthave a different set of tools. For crating charts etc has one tool, that also must compile the charts and see they work and do not have error, and then to call them for creating them on the fly.

Visuals and design must be lean, i do not want repeated titles, redundant information, excesive text, all must be signal focused not bloated AT ALL, and simple.
The design must avoid rounded elements, default to sharp rectangles with proper styles.
All the charts and graphs must be correctly proper in styles.