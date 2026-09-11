/* ---------------------------------------------------------------
   Babes Net — the Luma calendar as JSON

   The cards on /events are generated at build time and ship in the
   HTML (see scripts/build-events.js), so nothing on the site calls
   this. It stays because it is the one place to see exactly what Luma
   is handing us — `curl babesnet.xyz/api/luma-events` when the page
   looks wrong tells you whether the problem is upstream or ours.

   All the actual work is in lib/luma.js, shared with the build script
   so there is only ever one idea of what an event looks like.
   --------------------------------------------------------------- */

'use strict';

var luma = require('../lib/luma.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ upcoming: [], past: [] });
  }

  try {
    var data = await luma.fetchCalendar();

    /* Half an hour fresh, a day stale-while-revalidate: a past event is
       past. Luma sees one request per half hour per region rather than
       one per caller. */
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (err) {
    console.error('luma-events: ' + (err && err.message ? err.message : err));

    /* Still 200, still cacheable — briefly. An empty list is the honest
       answer whether Luma is down or the calendar is genuinely empty. */
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({ upcoming: [], past: [] });
  }
};
