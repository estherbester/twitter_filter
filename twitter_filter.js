// TODOS:
// Retrieve trucks from server
// Get more than one page of tweets from Twitter API

// Logging
var log = function(message) {
        console.log(''+ message);
};

// This widget takes a tweet and formats it to HTML.
var TweetFormatter = {};
TweetFormatter.construct = function(options) {
    var _dt_format = options.datetime_format, // this shoudl be a string with hh:mm etc

        // Param: JSON for a single tweet. Returns: HTML string
        render_markup = function(tweet) {
            var _sn = tweet.user.screen_name,
                // Turns hashtags, @names and links into links; populates HTML
                _linkified_text = $.linkify(tweet.text),
                _tweet_timestamp = new Date(tweet.created_at);
            return '<div class="tweet">' +
                   '<a href="http://twitter.com/' + _sn + '" rel="nofollow">' +
                    '<img src="' + tweet.user.profile_image_url + '" /></a>' +
                   '<strong><a href="http://twitter.com/' + _sn + '" rel="nofollow">' + _sn + '</a></strong>' +
                   '&nbsp;<span class="text">' + _linkified_text + '</span>' +
                   '<span class="time">' +
                     '<a href="http://twitter.com/' + _sn +'/statuses/' + tweet.id_str + '" rel="nofollow">' +
                     _tweet_timestamp.toString(_dt_format) + '</a>' +
                   '</span></div>';
        };
    return {format_text: render_markup};
};

// This widget filters tweets.
var TweetParser = {};
TweetParser.construct = function() {
    var process_tweets = function(fulljson, keywords, successHandler){
        // Specific keyword_cluster has been chosen, and there are keywords, so filter the tweets.
        filtered_json = _filter_tweets(fulljson, keywords); // which will filter tweets
        return successHandler(filtered_json);
        },

        // For the filtering. Thanks Stack Overflow!
        // http://stackoverflow.com/questions/4241431/how-to-search-one-string-for-all-of-the-words-contained-in-a-second-string
        _commonwords  = function(string, wordlist) {
            string= string.toLowerCase().split(/\s+/);
            wordlist= wordlist.toLowerCase().split(/\s+/);
            return wordlist.every(function(itm){
                return string.indexOf(itm)!= -1;
            });
        },
        // This is where the magic happens
        _filter_tweets = function(tweets, keywords) {
            var filtered_tweets = [],
                tweet_added = false; // Don't want tweets appended multiple times for matching multiple keywords

            for (var t=0;t < tweets.length; t++){
                tweet_text = tweets[t].text;
                tweet_name = tweets[t].user.screen_name;
                for (var k=0;k<keywords.length;k++){
                    keyword = keywords[k].toLowerCase(); // We are case-insensitive
                    if (tweet_added === false){
                        if ((tweet_text.toLowerCase().search(keyword) > -1) ||
                                        (_commonwords(tweet_text, keyword)) ||
                                          (tweet_name.search(keyword) > -1) ||
                                          (_commonwords(tweet_name, keyword)))
                            {
                                filtered_tweets.push(tweets[t]);
                                tweet_added = true;
                                continue;
                            }
                    }
                else { continue; }
                }
            }
            return filtered_tweets;
        };
    return { filter_tweets : process_tweets };
};


/* Currently, all info is trapped client-side. Maybe send some info to server for caching. */
var FT = {};
FT.construct = function(options) {
    var
    // URL should return JSON list of tweets. See examples of options in twitter_options below
    list_url='http://api.twitter.com/1/lists/statuses.json?callback=?',
    //list_url = 'test.json',
    //since_id = options.since_id,

    /* Specified here: https://dev.twitter.com/docs/api/1/get/lists/statuses */
    twitter_options = {
        slug : 'food',
        owner_screen_name : 'estherbester',
        per_page: 200,
        include_entities : false
    },
    current_cluster = options.current_cluster,
    container_div = options.container_div,
    header_div = options.header_div,
    search_div = options.search_div, // for quicksearch
    fail_div = options.fail_div,
    nav_link_prefix = options.nav_link_prefix,
    cached_tweets,
    cached_data,
    cache_expiry = 1000 * 60,  // 1 minute
    throbber_on = false,
    throbber = $('#throbber'),
    _keywords,
    // This is a model, should not be here!
    /*
    data structure looks like this:
    {   url_hash_name-for-keyword-cluster : {
            display_name: 'name that is shown in header',
            keywords: list of keywords to be filtered, as strings
            zip_code: this property is currently not used.
        }
    }
    */
    keyword_cluster = {
        'no-filter': {
            display_name: 'No Filter',
            keywords: [],
            zip_code: null
        },
        'santa-monica': {
            display_name: 'Santa Monica',
            keywords : ['santa monica', 'samo', 'arizona', 'ocean park', 'sawtelle',
                        'santamonica', 'hulu', 'westla', 'monica'],
            zip_code : 90401
        },
        'hollywood': {
            display_name: 'Hollywood',
            keywords : ['hollywood', 'cnn', 'arclight', 'cahuenga',
                        'amoeba', 'highland', 'gower', 'ivar', 'sunset', 'cole'],
            zip_code : 90028
        },
        'pico-robertson': {
            display_name: 'Pico/Robertson',
            keywords : ['pico robertson', 'robertson'],
            zip_code : 90035
        },
        'downtown-la' : {
            display_name: "Downtown LA",
            keywords : ['dtla', 'moca', 'artwalk', 'downtown'],
            zip_code : 90017
        },
        'miracle-mile' : {
            display_name: 'Miracle Mile',
            keywords : ['miracle mile', 'lacma', 'wilshire', 'fairfax', 'miracle'],
            zip_code : 90038
        },
        'pasadena':{
            display_name: 'Pasadena',
            keywords: ['pasadena'],
            zip_code: 90042
        },
        'ucla':{
            display_name: 'UCLA',
            keywords: ['ucla', 'westwood'],
            zip_code: 90095
        },
        'silverlake':{
            display_name: 'Silverlake',
            keywords: ['silverlake', 'echo park', 'rowena'],
            zip_code: 90026
        },
        'tarzana':{
            display_name: 'Tarzana',
            keywords: ['tarzana', 'valley'],
            zip_code: 91356
        }
    },

    // FAIL FAIL FAIL
    failHandler = function (message) {
        if(throbber !== undefined && throbber_on === true)
        {
            hide_throbber();
        }
        log('FAILED: '+ message);
    },

    // Called by the TweetParser as its successHandler, or by _process_tweets:
    // having fetched and/or filtered the tweets, we will cache and display them.
    successHandler = function (tweets) {
        _set_cache(container_div, current_cluster, tweets);
        //and display
        display_tweets(tweets);
    },

    load_throbber = function(){
        if (throbber_on === false && throbber !== undefined) {
            throbber_on = true;
            throbber.show();
        }
    },

    hide_throbber = function(){
        if (throbber_on === true && throbber !== undefined) {
            throbber_on = false;
            throbber.hide();
        }
    },
    // Params:
    //   element: DOM element that holds the cached data
    //   address: name for the cached object, a string
    //   cache_content: data to be cached.
    //   Also cached in same object as cache_content is timestamp
    _set_cache = function(element, address, cache_content) {
        element.data(address, {timestamp: new Date(), cache_content: cache_content});
    },

    //  Params: DOM element, name for cached object (a string)
    //  Returns cached content -- if there's nothing cached, this returns undefined
    _get_cache = function(element, address) {
        if (element.data(address) !== undefined &&
           new Date() - element.data(address).timestamp < cache_expiry)
        {
            return element.data(address).cache_content;
        }
    },

    // display the keywords for this keyword cluster
    show_cluster_info = function(keywords) {
        $(header_div).fadeIn();
        $(header_div + ' span:first-child').text(keyword_cluster[current_cluster].display_name);
        for (var i=0;i<keywords.length;i++){
            $('#keyword-list').fadeIn().append(
                '<span class="_keyword">'+ keywords[i] + '</span> '
        );}
    },
    clear_cluster_info = function() {
        $('#keyword-list').hide();
        $('#keyword-list span').remove(); // remove all the keywords we'd appended
        $(header_div).hide();
    },

    // Render each tweet by calling the Formatter.
    render_tweet = function(tweet) {
        var tweetformatter = TweetFormatter.construct({
            datetime_format: 'h:mmtt dddd MMM d'
            });
        container_div.append(tweetformatter.format_text(tweet));
    },

    // Show all the tweets, if there are any
    display_tweets = function(tweets) {
        hide_throbber();
        // If no tweets to show, we have a fail div that we can fall back on.
        if (tweets.length > 0) {
            if (fail_div.is(':visible')){
                fail_div.hide();
            }
            $.each(tweets, function(tweet, value){
                render_tweet(value);
            });

            enable_quicksearch();
        }
        else{
            // Disable the search form (since there are no tweets to search anyway)
            disable_quicksearch();
            if (fail_div.is(':hidden')){
                fail_div.show();
            }
            failHandler('No tweets found =(');
        }
    },
    /**  On-page quick-search to filter content.
        Thanks riklomas! https://github.com/riklomas/quicksearch */
    enable_quicksearch = function() {
        if($(search_div).hasClass("disabled")){
            $(search_div).removeClass('disabled');
        }
        if($(search_div + " input").prop("disabled"))
            {$(search_div + " input").prop("disabled", false);}
        // Argument for the quicksearch method: container div + class of individual tweet.
        var qs = $('input#search').quicksearch('#posts .tweet');
        qs.cache();
    },

    disable_quicksearch = function() {
        if ($(search_div).hasClass("disabled") !== true)
            {
                $(search_div).addClass("disabled");
                $(search_div + ' input').prop("disabled", true);
            }
    },
    // After tweets are fetched, we parse them if necessary to filter.
    _process_tweets = function(json) {
        if (json.length > 0) {
            // If no keywords, we can just call sucessHandler ...
            if (_keywords.length === 0 || _keywords === undefined) {
                log('No keyword filters: Showing all the tweets');
                successHandler(json);
            }
            // ... Otherwise, we shall filter them by those keywords.
            else {
                var tweetparser = TweetParser.construct();
                tweetparser.filter_tweets(json, _keywords, successHandler);
            }
        }
        else {
            log('JSON was not fetched =(');
        }
    },

    // If JSON is not already available in cache, let's make a call to Twitter API
    _fetch_json = function(){
        load_throbber();

        cached_data = _get_cache($('body'), 'jsonfetch');
        if (cached_data !== undefined ) {
            _process_tweets(cached_data);
        }
        else {
            $.getJSON(list_url, twitter_options, function(data, textStatus){
                    _set_cache($('body'), 'jsonfetch', data); // cache the response
                    _process_tweets(data);
                    return false;
                    // TODO: better error handling
                    });
        }
    },

     // Add onclick events to all the links for each cluster.
    add_link_events = function() {
        var nav_links = $('.nav_link'),
            link_to_no_filter = $('.raw_feed');  // other links to load raw feed

        nav_links.each(function(index, value) {
            $(value).click(function(event){
                // Grabs value inside <a> tags. Maybe don't do this.
                current_cluster = value.id.replace(nav_link_prefix, '');
                _reload(current_cluster);
                event.preventDefault();
            });
        });
        // Add click events to non-nav links to full feed.
        link_to_no_filter.each(function(index, value) {
            $(value).click(function(event){
                current_cluster = "no-filter";
                _reload(current_cluster);
                event.preventDefault();
            });
        });
    },

    _reload = function(cluster) {
        if (container_div.length > 0) {
            container_div.empty();}

        // Remove all the keywords at the top.
        clear_cluster_info();

        // In nav, un-highlight all tabs, re-highlight new
        $('#nav li').removeClass('ui-selected');

        // SETTING THE NEW KEYWORD CLUSTER
        current_cluster = cluster;

        _init();
    },
    _init = function() {
        if (keyword_cluster[current_cluster] === undefined) {
            log("We can't filter this keyword cluster");
            current_cluster = 'no-filter';
            }

        // Get and render the keyword filters for the current keyword cluster
        _keywords = keyword_cluster[current_cluster].keywords;
        if (_keywords !== undefined && _keywords.length > 0) {
                show_cluster_info(_keywords);
        }
        // If tweets exist in recent cache, use that.
        // Might forgo this and let each cluster re-process the JSON,
        // since the latter may be available in cache anyway.
        cached_tweets = _get_cache(container_div, current_cluster);
        if(cached_tweets !== undefined) {
            display_tweets(cached_tweets);
        }
        else {
            _fetch_json();
        }

        // Highlight the currently loaded keyword cluster in the navigation
        $('#'+ nav_link_prefix + current_cluster).addClass('ui-selected');

        // For history change
        window.location.hash = current_cluster;
        history.replaceState(current_cluster, 'keywords'); // maybe pushState?
    };

    _init();

    // Bind click events; only wanna do this once, otherwise the clicks pile on.
    add_link_events();

    // For back arrow functionality.
    window.onpopstate = function() {
        current_cluster = window.location.hash.replace('#','');
        _reload(current_cluster);
        return false;
    };

};

