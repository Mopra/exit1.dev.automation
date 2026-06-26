// The content calendar for the scheduled (non-outage) X automation.
//
// This is the hand-curated, approved 30-day plan for @pradslabs. It is the
// SOURCE OF TRUTH: each entry has an explicit UTC date + time, a category, and
// the exact post text. The scheduler reads this list directly (it does not
// generate the schedule), so what you see here is what posts — plus a small
// deterministic +/- jitter at runtime so times do not land robotically on the
// same minute every day.
//
// Editing: change text/date/time here, then run `npm run calendar` to refresh
// the readable draft (drafts/content-calendar.md) and confirm nothing exceeds
// 280 chars. Strings use backticks so apostrophes/quotes never need escaping.
// No links in bodies (links cap reach); schedule.js sanitizes as a safety net.
//
// Positioning: build authority around reliability / monitoring / simple
// software / AI-assisted building, with exit1 as proof of the worldview rather
// than the subject. ~8 posts are deliberate reply-bait (questions / open loops)
// because replies are the reach engine while the feed builds credibility.

export const CALENDAR = [
  // 2026-06-27 (Saturday) — 4
  { date: '2026-06-27', time: '11:45', pillar: 'Reliability / monitoring', text: `Every fake alert teaches the team one tiny lesson: maybe the monitor is being dramatic again. That is how trust dies.` },
  { date: '2026-06-27', time: '14:30', pillar: 'AI-assisted building', text: `The fastest way to get bad code from an AI agent is to be vague and then act surprised when it guesses.` },
  { date: '2026-06-27', time: '17:30', pillar: 'Build in public / exit1', text: `The more I build exit1, the messier uptime looks. Slow in one region. Fine in another. DNS weird for 90 seconds. Technically alive, practically painful.` },
  { date: '2026-06-27', time: '21:00', pillar: 'Builder taste', text: `Most software has too many little decisions standing between the user and the thing they came to do. That tax compounds fast.` },

  // 2026-06-28 (Sunday) — 2
  { date: '2026-06-28', time: '14:30', pillar: 'Reliability / monitoring', text: `Found out your app was down from a customer email? That one has a very special taste of shame.` },
  { date: '2026-06-28', time: '20:45', pillar: 'Personal / founder life', text: `Solo SaaS is funny. One minute you are deep in alert pipelines. The next minute you are negotiating bedtime with a toddler. Both are production systems.` },

  // 2026-06-29 (Monday) — 3
  { date: '2026-06-29', time: '12:30', pillar: 'AI-assisted building', text: `Running multiple agents at once feels like having a tiny engineering team until you remember you are also the manager, QA, product owner, and janitor.` },
  { date: '2026-06-29', time: '16:30', pillar: 'Reliability / monitoring', text: `What is the worst way you have found out a site was down? Customer email, angry tweet, Slack panic, or pure luck?` },
  { date: '2026-06-29', time: '21:00', pillar: 'Build in public / exit1', text: `I keep tuning exit1 around one principle: if it wakes you up, it better be right.` },

  // 2026-06-30 (Tuesday) — 3
  { date: '2026-06-30', time: '12:30', pillar: 'Builder taste', text: `Boring software is underrated because nobody screenshots it. But boring software is what people keep paying for.` },
  { date: '2026-06-30', time: '16:30', pillar: 'Reliability / monitoring', text: `The least interesting failure state is down. The interesting ones are slow, flaky, regional, expired, drifting, and technically alive but practically useless.` },
  { date: '2026-06-30', time: '21:00', pillar: 'AI-assisted building', text: `AI coding made me write fewer functions and more instructions. Annoyingly, that exposed how often I did not know exactly what I wanted.` },

  // 2026-07-01 (Wednesday) — 4
  { date: '2026-07-01', time: '11:45', pillar: 'Build in public / exit1', text: `One thing I love about building exit1: every feature has a brutal test. Would this help when something is actually on fire? If not, why does it exist?` },
  { date: '2026-07-01', time: '14:30', pillar: 'Reliability / monitoring', text: `Most status pages are theater until the day everything breaks. Then suddenly it is the most important page you own.` },
  { date: '2026-07-01', time: '17:30', pillar: 'Personal / founder life', text: `The older I get, the less impressed I am by heroic bursts. Show up daily. Fix one thing. Remove one annoyance. Let it compound.` },
  { date: '2026-07-01', time: '21:00', pillar: 'AI-assisted building', text: `AI makes taste more obvious. Bad direction just gets implemented faster now.` },

  // 2026-07-02 (Thursday) — 2
  { date: '2026-07-02', time: '14:30', pillar: 'Reliability / monitoring', text: `I keep seeing alerting bugs that look technical at first, then turn out to be trust bugs. Too loud, too late, too vague.` },
  { date: '2026-07-02', time: '20:45', pillar: 'Builder taste', text: `A 20-minute walkthrough can hide a lot of unfinished product. The user should feel value before the tour starts sweating.` },

  // 2026-07-03 (Friday) — 2
  { date: '2026-07-03', time: '14:30', pillar: 'Reliability / monitoring', text: `Monitoring people: when do you actually reach for heartbeat checks instead of external HTTP checks? Cron jobs only, or more than that?` },
  { date: '2026-07-03', time: '20:45', pillar: 'Build in public / exit1', text: `I built multi-region checks into exit1 because up in Europe and down in the US is still down for someone.` },

  // 2026-07-04 (Saturday) — 4
  { date: '2026-07-04', time: '11:45', pillar: 'Hot take / industry', text: `Enterprise software often confuses configurability with power. Sometimes it is just fear of making a decision.` },
  { date: '2026-07-04', time: '14:30', pillar: 'Personal / founder life', text: `I like building in public because it removes the fake mystery. Most products are not born polished. They are dragged into usefulness one weird edge case at a time.` },
  { date: '2026-07-04', time: '17:30', pillar: 'Reliability / monitoring', text: `The best alert is boring until the exact second it becomes priceless.` },
  { date: '2026-07-04', time: '21:00', pillar: 'AI-assisted building', text: `Reviewing AI-written code is less about finding syntax errors and more about finding misplaced confidence.` },

  // 2026-07-05 (Sunday) — 3
  { date: '2026-07-05', time: '12:30', pillar: 'Builder taste', text: `What is one SaaS feature everyone asks for, but you secretly think makes the product worse?` },
  { date: '2026-07-05', time: '16:30', pillar: 'Reliability / monitoring', text: `False positives feel small until the real alert arrives and everyone has already learned to ignore the noise.` },
  { date: '2026-07-05', time: '21:00', pillar: 'Build in public / exit1', text: `Today's exit1 thought: a 10-second hiccup can be nothing, or the first cough before a real incident. Alerting lives in that annoying gray zone.` },

  // 2026-07-06 (Monday) — 3
  { date: '2026-07-06', time: '12:30', pillar: 'AI-assisted building', text: `Typing used to feel like the bottleneck. Now I spend more time asking: should this exist, should it be smaller, should it be deleted?` },
  { date: '2026-07-06', time: '16:30', pillar: 'Reliability / monitoring', text: `Your status page dying during an outage is the kind of product feedback that does not bother opening a polite support ticket.` },
  { date: '2026-07-06', time: '21:00', pillar: 'Personal / founder life', text: `Some days the win is a feature. Some days the win is getting to bedtime stories on time. Both count. One just has worse observability.` },

  // 2026-07-07 (Tuesday) — 2
  { date: '2026-07-07', time: '14:30', pillar: 'Reliability / monitoring', text: `Worst outage message format: "hey, is your app down?" Sent by a customer. Before your tools said anything.` },
  { date: '2026-07-07', time: '20:45', pillar: 'Build in public / exit1', text: `I keep coming back to the same product shape for exit1: fast enough to matter, quiet enough to trust, simple enough to actually use.` },

  // 2026-07-08 (Wednesday) — 4
  { date: '2026-07-08', time: '11:45', pillar: 'Hot take / industry', text: `Most best practices are just old scars. Useful, but still worth asking if the wound is yours.` },
  { date: '2026-07-08', time: '14:30', pillar: 'AI-assisted building', text: `Agents are great at momentum. They are bad at knowing whether the direction is worth going. That part is still the job.` },
  { date: '2026-07-08', time: '17:30', pillar: 'Reliability / monitoring', text: `A useful monitor gets you out of guessing mode fast. DNS? Connect? TLS? TTFB? Give me the boring clue trail.` },
  { date: '2026-07-08', time: '21:00', pillar: 'Builder taste', text: `The more I build, the more I think great UX is mostly removing tiny moments of hesitation.` },

  // 2026-07-09 (Thursday) — 3
  { date: '2026-07-09', time: '12:30', pillar: 'Build in public / exit1', text: `I like the live checks page in exit1 because old logs feel dead. Monitoring should feel like watching the system breathe.` },
  { date: '2026-07-09', time: '16:30', pillar: 'Reliability / monitoring', text: `DNS, connect, TLS, TTFB. The boring little stages that suddenly become very interesting when your app feels slow.` },
  { date: '2026-07-09', time: '21:00', pillar: 'Personal / founder life', text: `Building from Denmark used to feel like distance. Now it mostly feels like fewer excuses.` },

  // 2026-07-10 (Friday) — 4
  { date: '2026-07-10', time: '11:45', pillar: 'Hot take / industry', text: `The framework wars are fun until you remember users have never once paid because you picked the elegant router.` },
  { date: '2026-07-10', time: '14:30', pillar: 'Reliability / monitoring', text: `A check that only asks did it return 200 is like a doctor only asking are you alive.` },
  { date: '2026-07-10', time: '17:30', pillar: 'AI-assisted building', text: `The best AI workflow I have found is boring: clear goal, small scope, tests, review, redirect. Magic mostly shows up after discipline.` },
  { date: '2026-07-10', time: '21:00', pillar: 'Builder taste', text: `Simple pricing is a product feature. Every confused buyer is a support ticket you created on purpose.` },

  // 2026-07-11 (Saturday) — 2
  { date: '2026-07-11', time: '14:30', pillar: 'Build in public / exit1', text: `One reason I care about exit1 pricing staying sane: side projects, small agencies, and early SaaS teams still deserve serious monitoring.` },
  { date: '2026-07-11', time: '20:45', pillar: 'Reliability / monitoring', text: `Nobody wants more dashboards. They want fewer surprises.` },

  // 2026-07-12 (Sunday) — 3
  { date: '2026-07-12', time: '12:30', pillar: 'AI-assisted building', text: `Vibe coding gets mocked by people who have never tried to describe a product clearly enough for another intelligence to build it.` },
  { date: '2026-07-12', time: '16:30', pillar: 'Reliability / monitoring', text: `The most expensive downtime is not always the longest. It is the one that happens at the exact wrong moment.` },
  { date: '2026-07-12', time: '21:00', pillar: 'Personal / founder life', text: `A toddler is basically an incident commander with snacks. Loud, urgent, unclear root cause, impossible to snooze.` },

  // 2026-07-13 (Monday) — 2
  { date: '2026-07-13', time: '14:30', pillar: 'Build in public / exit1', text: `I am trying to make exit1 feel less like an observability cockpit and more like a reliable instrument panel. Fewer knobs. Better signal.` },
  { date: '2026-07-13', time: '20:45', pillar: 'Reliability / monitoring', text: `Hot take: most status pages are theater. Useful mostly after the trust is already damaged. Am I wrong?` },

  // 2026-07-14 (Tuesday) — 4
  { date: '2026-07-14', time: '11:45', pillar: 'Hot take / industry', text: `Complexity feels like progress when you are building it. It feels like tax when you are maintaining it.` },
  { date: '2026-07-14', time: '14:30', pillar: 'AI-assisted building', text: `The weirdest agentic coding moment is watching it hit a wall, back up, try another route, and recover like a tiny stubborn teammate.` },
  { date: '2026-07-14', time: '17:30', pillar: 'Reliability / monitoring', text: `What is worse in monitoring: one missed real outage, or ten false positives in a week? I think the answer depends on team scars.` },
  { date: '2026-07-14', time: '21:00', pillar: 'Builder taste', text: `Deleting a feature can feel like losing work. Usually it is the product finally taking a breath.` },

  // 2026-07-15 (Wednesday) — 3
  { date: '2026-07-15', time: '12:30', pillar: 'Reliability / monitoring', text: `If you cannot explain why an alert fired, you do not have alerting. You have noise with timestamps.` },
  { date: '2026-07-15', time: '16:30', pillar: 'Build in public / exit1', text: `Small exit1 lesson: logs should not be an archive of confusion. They should explain what happened, what changed, and whether anyone was notified.` },
  { date: '2026-07-15', time: '21:00', pillar: 'Personal / founder life', text: `The internet rewards loud certainty. Building rewards quiet patience. Annoying mismatch, but useful to remember.` },

  // 2026-07-16 (Thursday) — 2
  { date: '2026-07-16', time: '14:30', pillar: 'AI-assisted building', text: `I trust AI more with code than with product judgment. Code can compile. Taste has to be earned.` },
  { date: '2026-07-16', time: '20:45', pillar: 'Reliability / monitoring', text: `SSL expiry is such a stupid way to lose trust. Which is exactly why it deserves automation.` },

  // 2026-07-17 (Friday) — 4
  { date: '2026-07-17', time: '11:45', pillar: 'Hot take / industry', text: `Most SaaS bloat starts with one reasonable request from one reasonable customer.` },
  { date: '2026-07-17', time: '14:30', pillar: 'Build in public / exit1', text: `If you monitor client sites for an agency, what do clients actually care about: uptime %, response time, status pages, or just not being surprised?` },
  { date: '2026-07-17', time: '17:30', pillar: 'Reliability / monitoring', text: `A good monitoring tool should make you feel slightly calmer, not like you adopted a needy robot.` },
  { date: '2026-07-17', time: '21:00', pillar: 'Builder taste', text: `The best products have a point of view. The worst ones have a settings page for every disagreement.` },

  // 2026-07-18 (Saturday) — 3
  { date: '2026-07-18', time: '12:30', pillar: 'AI-assisted building', text: `The more agents I run, the more I value tests. Not because tests are trendy. Because confidence needs a receipt.` },
  { date: '2026-07-18', time: '16:30', pillar: 'Reliability / monitoring', text: `Regional failures are humbling. From one place everything looks fine. From another place the building is on fire.` },
  { date: '2026-07-18', time: '21:00', pillar: 'Personal / founder life', text: `A good walk fixes more bugs than another hour of angry scrolling through the same file.` },

  // 2026-07-19 (Sunday) — 3
  { date: '2026-07-19', time: '12:30', pillar: 'Reliability / monitoring', text: `99.99% uptime sounds great right until the missing 0.01% lands during checkout, onboarding, or a customer demo.` },
  { date: '2026-07-19', time: '16:30', pillar: 'Build in public / exit1', text: `My favorite version of exit1 is boring all week, then brutally useful for the one minute where it has earned your attention.` },
  { date: '2026-07-19', time: '21:00', pillar: 'Hot take / industry', text: `If your app needs microservices before it has customers, the architecture is doing cosplay.` },

  // 2026-07-20 (Monday) — 2
  { date: '2026-07-20', time: '14:30', pillar: 'AI-assisted building', text: `AI coding turned vague communication into a very expensive habit. The model will happily build exactly the wrong thing at high speed.` },
  { date: '2026-07-20', time: '20:45', pillar: 'Reliability / monitoring', text: `A background job that silently stops is one of the nastiest failures. No crash. No red screen. Just missing work.` },

  // 2026-07-21 (Tuesday) — 4
  { date: '2026-07-21', time: '11:45', pillar: 'Build in public / exit1', text: `I like heartbeat monitoring for cron jobs because the job should prove it ran. Waiting for someone to notice missing work is a bad system.` },
  { date: '2026-07-21', time: '14:30', pillar: 'Builder taste', text: `The more senior I get, the less I worship cleverness. Clear beats clever so often it starts to look unfair.` },
  { date: '2026-07-21', time: '17:30', pillar: 'Reliability / monitoring', text: `Incident history without context is just a graveyard. You need notes, timing, alerts, and the boring details people forget by morning.` },
  { date: '2026-07-21', time: '21:00', pillar: 'Personal / founder life', text: `Being a founder and a dad mostly means learning which things deserve urgency and which things just learned to scream.` },

  // 2026-07-22 (Wednesday) — 2
  { date: '2026-07-22', time: '14:30', pillar: 'Build in public / exit1', text: `I keep building exit1 around small practical questions. Would this have saved me during the last bad deploy? Would it have saved a customer?` },
  { date: '2026-07-22', time: '20:45', pillar: 'Reliability / monitoring', text: `Finding out late makes every incident worse. The bug is bad enough. The surprise is what makes it expensive.` },

  // 2026-07-23 (Thursday) — 3
  { date: '2026-07-23', time: '12:30', pillar: 'AI-assisted building', text: `A good AI agent is like a brilliant intern. Fast, useful, occasionally wrong in ways that sound completely reasonable.` },
  { date: '2026-07-23', time: '16:30', pillar: 'Hot take / industry', text: `Open source is the best deal in software and somehow we still treat maintainers like vending machines with GitHub profiles.` },
  { date: '2026-07-23', time: '21:00', pillar: 'Reliability / monitoring', text: `What is the dumbest outage you have seen? My favorites are always the boring ones: expired cert, DNS typo, forgotten cron job.` },

  // 2026-07-24 (Friday) — 4
  { date: '2026-07-24', time: '11:45', pillar: 'Build in public / exit1', text: `One thing I care about in exit1: when you are doing planned work, the tool should understand that. Alerting without context is just shouting.` },
  { date: '2026-07-24', time: '14:30', pillar: 'AI-assisted building', text: `I used to measure output by how much code I wrote. Now I measure it by how much useful product moved without making the system worse.` },
  { date: '2026-07-24', time: '17:30', pillar: 'Reliability / monitoring', text: `The best monitoring setup is the one you forget about until the one day it saves you.` },
  { date: '2026-07-24', time: '21:00', pillar: 'Personal / founder life', text: `Comparison is poison with good typography. Close the tab. Build the thing in front of you.` },

  // 2026-07-25 (Saturday) — 2
  { date: '2026-07-25', time: '14:30', pillar: 'Builder taste', text: `A product gets better when the defaults get smarter, not when every user gets promoted to system administrator.` },
  { date: '2026-07-25', time: '20:45', pillar: 'Reliability / monitoring', text: `When an alert sends you on a five-tab dashboard treasure hunt, the alert shipped half-finished.` },

  // 2026-07-26 (Sunday) — 4
  { date: '2026-07-26', time: '11:45', pillar: 'Build in public / exit1', text: `I want exit1 alerts to answer three things fast: what broke, where it broke, and why you should care.` },
  { date: '2026-07-26', time: '14:30', pillar: 'AI-assisted building', text: `The teams winning with AI will be boring about verification. Specs, tests, review, small loops. Less magic. More receipts.` },
  { date: '2026-07-26', time: '17:30', pillar: 'Reliability / monitoring', text: `Be honest: do you check your own status page after every deploy, or only after the first weird Slack message?` },
  { date: '2026-07-26', time: '21:00', pillar: 'Personal / founder life', text: `We get one short run at this. Build useful things. Be there for your people. Try not to confuse attention with meaning.` },
];
