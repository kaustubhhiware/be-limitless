var currentSite = null;
var currentTabId = null;
var prevTime = null;
ANALYTICS_HOST = 'https://limitless-py.appspot.com';

var today = new Date();
var lastSite = null;
var awaytime = 0;
// var domainRegxp = /^(?:www\.)?(.*?)\.(?:com|au\.uk|co\.in)$/;
var timeanalytics;
var sessionData = {};


var updateCounterInterval = 120;  // 2 min without activity on a page is ok.
var backupduration = 3600 * 24; //backup metadata everyday


var GETURL = "https://nice-fx-116906.appspot.com/geturl?op=categorize&url=";
var HELPURL = "https://nice-fx-116906.appspot.com/help";


function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}

function updateCounter() {
//	console.log("Updating counter");
  //basic housekeeping
  if((today.getTime() / 1000 - getLastMetadataBackup()) > backupduration)  backupDatainServer();

  if(localStorage.paused == 1 && (today.getTime() / 1000 - localStorage.pausetime) > 1800) {
    //console.log("Pause is being removed");
    localStorage.paused = 0;
    localStorage.pausetime = 0;
  }

  else if(localStorage.paused == 1 || currentTabId == null || !chrome.tabs) {
    //console.log("Paused");
    chrome.browserAction.setBadgeText({text: ""});
    currentSite = null;
    return;
  }

  //actual timer
  manageTimer();
}

/*
 The core function;
 */
function manageTimer() {
  //console.log("Timer Management");
  chrome.tabs.get(currentTabId, function(tab) {
    /* Make sure we're on the focused window, otherwise we're recording bogus stats. */
    chrome.windows.get(tab.windowId, function(window) {
      if(!window.focused) return;
      var url = tab.url;
      if(url == null)     return; //malformed url

      //console.log("Got a focused window");

      //Now we have interesting things going on here.
      var site = getSiteFromUrl(url);
      var domain = getDomainName(url);
      var sitetitle = tab.title;

      if(domain == null || site == null)     return; //malformed url
      if(isDontTrack(domain)) {
        chrome.browserAction.setBadgeText({text: ""});
        return;
      }

      today = new Date();
      //Start timer for this site
      if(currentSite == null || currentSite != url) {
        currentSite = url;
        prevTime = today;
        timeOnSite = 0;
        //console.log("New site:" + url);
        return;
      }

      var delta = Math.floor((today.getTime() - prevTime.getTime()) / 1000); //convert to seconds
      prevTime = today;
      timeOnSite += delta;

      //console.log("Time on site:"+timeOnSite);

      //Find out how much we can allow people to be idle
      var updatecounter = updateCounterInterval;
      var category = getCategory(domain);

      // console.log("Category:"+category);
      if(category && category == "Videos")
        updatecounter = 60 * 5; //set 5 min for youtube videos

      if(timeOnSite > updatecounter)   return;  //Too much idle. Ignore this.

      // console.log("Updating the timer:"+timeOnSite);

      var timeSpentToday = getTimeSpentDayFormatted(domain, today.toDateString());

      //	  console.log("TimeSpentToday:"+timeSpentToday);

      if(timeSpentToday !== null) {
        //	console.log("Updating the Badge:"+timeSpentToday+" Productive"+getProductive(domain));

        if(getProductive(domain))    setBadge([0, 255, 0, 255], timeSpentToday[0]);
        else                 setBadge([255, 0, 0, 255], timeSpentToday[0]);
      }

      if(shouldQueryServer(domain)) {
        if(sites.length==0 || sites[domain]==undefined){
          // console.log('setting category Social')
          updateTimeNew(domain, 'Social', delta, url)
        }else{
          // console.log(sites[domain])
          updateTimeNew(domain, sites[domain], delta, url)
        }
      } else {
        //	console.log("Not Querying:"+domain+" "+getCategory(domain));
        updateTimeNew(domain, category, delta, url);
      }

    });
  });

}

function updateTimeNew(domain, category, timespent, url) {
//  console.log("Category:"+category);
  try{
    timeanalytics = JSON.parse(localStorage.timeanalytics);
  }catch(err){
    //nothing to do for now..
    timeanalytics = {}
  }

  try{
    siteanalysis = JSON.parse(localStorage.siteanalysis);
  }catch(err){
    //nothing to do for now..
    siteanalysis = {}
  }
  //First check if this visit is productive.
  var productive = 0;

  if(timeanalytics[domain]) {
    productive = parseInt(timeanalytics[domain]["productive"]);
    //	console.log("Cached: "+category+" "+productive+" "+domain);

  }
  else if(category == "Work" || category == "Learning" || category == "Reference") {
    productive = 1; //Since the domain is new, we will use existing heuristics
    //console.log(category + " " + productive + " " + domain);
  }


  today = new Date();
  var hour = Number(today.getHours());
  var d = today.toDateString();

  hour = Number(today.getHours());

//Calculate hour level productivity
  try{
    var productivity = JSON.parse(localStorage.productivity);
  }catch(err){
    var productivity = {}
  }
  if(!productivity[d])
    productivity[d] = {};

  if(!productivity[d][hour]) {
    productivity[d][hour] = {};
    productivity[d][hour]["timespent"] = timespent;
    productivity[d][hour]["productive"] = 0;
  }
  else {
    productivity[d][hour]["timespent"] += timespent;
  }

  if(productive)
    productivity[d][hour]["productive"] += timespent;
  else
    productivity[d][hour]["productive"] += 0;


  localStorage.productivity = JSON.stringify(productivity);

//Calculate domain level productivity
  if(!timeanalytics[domain]) {
    //Initial Setup
    timeanalytics[domain] = {};
    timeanalytics[domain][d] = timespent;
  }
  else if(!timeanalytics[domain][d]) {
    timeanalytics[domain][d] = timespent;
  }
  else {
    timeanalytics[domain][d] += timespent;
  }

  timeanalytics[domain]["productive"] = productive;
  timeanalytics[domain]["category"] = category;
  localStorage.timeanalytics = JSON.stringify(timeanalytics);

  if(timespent == 0)
    return;

  if(!sessionData.url){
    sessionData = {
      url: url,
      end_time: today,
      duration: timespent
    };

  }else if(sessionData.url && sessionData.url != url){
    siteanalysis.sessions = siteanalysis.sessions ? siteanalysis.sessions : [];
    siteanalysis.sessions.push(sessionData);
    localStorage.siteanalysis = JSON.stringify(siteanalysis);

    sessionData = {
      url: url,
      end_time: today,
      duration: timespent
    };

  }else{
    sessionData.duration += timespent;
    sessionData.end_time = today;
  }
}

function syncStats() {
  try{
    var metadata = JSON.parse(localStorage.metadata);
    var siteanalysis = JSON.parse(localStorage.siteanalysis);
    var privatedata=JSON.parse(localStorage.privatedata)
  }catch(e){
    var metadata = {};
    var siteanalysis = {};
    var privatedata={};
  }

  var suid = metadata.suid;
  var sessions = siteanalysis.sessions;
  var email=privatedata.email;
  var name=privatedata.name;
  if(sessions.length == 0)
    return;

  geolocation(function(geo) {
    var sessionsData = {uid: suid, geo: geo, email:email, name: name, sessions: sessions};
    // console.log(JSON.stringify(sessionsData));
    $.ajax({
      url: ANALYTICS_HOST + '/store_session',
      data: JSON.stringify(sessionsData),
      success: function (data) {
        try {
          var siteanalysis = JSON.parse(localStorage.siteanalysis);
        } catch (e) {
          var siteanalysis = {};
        }
        $.each(sessions, function (session, index) {
          siteanalysis.sessions.splice(siteanalysis.sessions.indexOf(session), 1)
        });
        localStorage.siteanalysis = JSON.stringify(siteanalysis);
      },
      contentType: 'application/json',
      dataType: 'json',
      type: 'POST'
    })
  });
}

function initialize() {
  dataSetup();
  isFirstInstall();

  //if(isFirstInstall())
  //  chrome.tabs.create({url: HELPURL});

  if(!localStorage.paused) {
    localStorage.paused = 0;
    localStorage.pausetime = 0;
  }

  // Add new suid
  try{
    var metadata = JSON.parse(localStorage.metadata);
    if(!metadata.suid){
      metadata.suid = guid();
      localStorage.metadata = JSON.stringify(metadata);
    }
  }catch(e){}

  /* Add some listeners for tab changing events. We want to update our
   *  counters when this sort of stuff happens. */
  chrome.tabs.onSelectionChanged.addListener(
    function(tabId, selectionInfo) {
      currentTabId = tabId;
      updateCounter();
    });

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if(tabId == currentTabId) {
      updateCounter();
    }
  });

  chrome.windows.onFocusChanged.addListener(
    function(windowId) {
      if(windowId == null || windowId == -1) {
        return;
      }

      chrome.windows.get(windowId, function(chromeWindow) {
        if(chromeWindow.state === "minimized") {
          //console.log("Minimized");
          return;
        }
      });

      chrome.tabs.getSelected(windowId, function(tab) {
        //	console.log("Updating");
        currentTabId = tab.id;
        updateCounter();
      });
    });

  /* Force an update of the counter every 2 seconds */
  window.setInterval(updateCounter, 2*1000);
  // window.setInterval(syncStats, 12*60*60*1000);
}


initialize();

(function () {
	if (chrome && chrome.runtime && chrome.runtime.setUninstallURL) {
		chrome.runtime.setUninstallURL("https://Be-Limitless.github.io/");
	}
})();
