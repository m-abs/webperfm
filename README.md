== Real life performance test ==

This nodejs application uses real life data from Open Web Analytic
to run performance test on a website.

The idea is that automated performance tests on a website is difficult
to do, because you need to generate a test that looks life actual visitors.

If you're using Open Web Analytics, you've data that can be used to for that purpose.

This script reads actual user sessions from a site and uses those sessions to crawl
the site like the user did, with the same interval.

This is still just at the proof of concept stage.

=== TODO ===
- More reliable way to run many sessions at once. Right now we fork cpu * 20 workers that each run a single session at one time.
- Select site, right on it will run on all sites in the database.
- It would be really nice, if the crawler could handle caching properly, e.g. E-Tag, expires and so on.
- Be creative, find a proper name for this project.
