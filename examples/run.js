var yahooFinance = require('./../');

// try {
// 	yahooFinance.historical({
// 		symbols: ['AAPL', 'YHOO'],
// 		from: '2014-01-01',
// 		to: '2015-10-20',
// 		period: 'v' // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
// 	}, function(err, quotes) {
// 		console.log(quotes);
// 	});
// } catch (e) {
// 	console.log(e);
// }



yahooFinance.splitsAndDivs({
	symbols: ['AAPL', 'YHOO'],
	from: '2014-01-01',
	to: '2015-10-20',
}, function(err, quotes) {
	console.log(quotes);
});

// http://ichart.finance.yahoo.com/x?s=IBM&a=00&b=2&c=1962&d=04&e=25&f=2011&g=v&y=0&z=30000


// payload = {'a':start.month, 'b': start.day, 'c': start.year,
//                'd':end.month, 'e':end.day, 'f':end.year, 's':sym,
//                'g':'v'}


// sn	Ticker symbol (YHOO in the example)
// a	The "from month" - 1
// b	The "from day" (two digits)
// c	The "from year"
// d	The "to month" - 1
// e	The "to day" (two digits)
// f	The "to year"
// g	v for dividendOnly d for day, m for month, y for yearly