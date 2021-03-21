//
//          Solar charting application for SolarEdge API
//          Burkhard R. Braun   December, 2020
//          Free for use and revision
//          For EarthWise customers
//
//          Run by placing the HTML and javascript file together and dragging the HTML file to a browser
//          It can also run from a server, etc.
//          In the file solar.js, enter your site ID and your API key (from advanced settings in SolarEdge monitoring app)
//          into the top two variables. Make sure to save the page after making the API key, so it registers to SolarEdge.
//
//          This uses Chart.js for graphing services


var site_id = "";            //   Enter your site number here, like  1234567
var api_key = "";  //  Enter your API key here, like  78PTSO8XNTSO8WKKVRNSEVTSO8NO4P8I
                            // This is obtainable from your web account with SolarEdge
var inverter_serial = '';  //  Enter your inverter serial number here, like  3F818A2E-20

// Nothing below here needs to be edited, though it can be if desired.

var chart_title = "Solar site tracking for site " + site_id;
var chart_battery_title = "Battery status tracking for site " + site_id;


var timenow = nowtime(0);
var timepast = nowtime(48);  // supply number of hours back, then forward to start of next day.

var rename_scheme = {
    "Production" : 'Production',
    "Consumption" : 'Consumption',
    "FeedIn" : "Export",
    "Purchased" : "Import"
};
var color_scheme = {    // line
    "Production" : 'rgba(144, 238, 144, 0.9)',           // lightgreen = rgba(144, 238, 144)
    "Consumption" : 'rgba(255, 0, 255, 0.9)',              // red = rgba(255, 0, 0)
                                                                            // yellow = rgba(255, 255, 0)
                                                                            // DimGray = rgba(105, 105, 105)
                                                                            // DarkOrange  rgba(255, 140, 0)
                                                                            // Crimson  rgba(220, 20, 60)
                                                                            // MediumTurquoise   rgba(72, 209, 204)
                                                                            // fuchsia = rgba(255, 0, 255)
    "Export" : "rgba(0, 128, 0, 0.9)",                       // green = rgba(0, 128, 0)
    "Import" : "rgba(255, 0, 0, 0.9)",                       // blue = rgba(0, 0, 255)
                                                                          //  darker red  222, 49, 99
                                                                          
    "Self consumption" : "rgba(64, 224, 208, 1.0)", // MediumTurquoise   rgba(72, 209, 204)
                                                                            // DarkTurquoise   rgba(0, 206, 209)
                                                                            // CadetBlue 	rgba(95, 158, 160)
                                                                            // SteelBlue  rgba(70, 130, 180)
    "Fill state": "rgba(0, 0, 255, 0.9)",
    "Charging": "rgba(0, 128, 0, 0.9)",
    "Inverter power": "rgba(127, 255, 0, 0.9)",             // chartreuse = rgba(127, 255, 0)
    "Yesterday": "black",
    "Solar": "rgba(255, 140, 0)"                                 // gold   or dark orange
};
var color_scheme_fill = {
    "Production" : 'rgba(144, 238, 144, 0.2)',           // lightgreen = rgba(144, 238, 144)
    "Consumption" : 'rgba(255, 0, 255, 0.3)',              // yellow .... red = rgba(255, 0, 0)
    "Export" : "rgba(0, 128, 0, 0.2)",                       // green = rgba(0, 128, 0)
    "Import" : "rgba(255, 0, 0, 0.3)",                       // blue = rgba(0, 0, 255)
    "Self consumption" : "rgba(64, 224, 208, 0.5)", // fuchsia = rgba(255, 0, 255)    MediumTurquoise   rgba(72, 209, 204)
                                                                           // LavenderBlush	rgba(255, 240, 245)
                                                                           // WhiteSmoke	rgba(245, 245, 245)
                                                                           // teal-y kind of thing 64, 224, 208
    "Fill state": "rgba(0, 0, 255, 0.2)",
    "Charging": "rgba(0, 128, 0, 0.2)",
    "Inverter power": "rgba(127, 255, 0, 0.2)",             // chartreuse = rgba(127, 255, 0)
    "Yesterday": "black",
    "Solar":"rgba(255, 215, 0, 0.5)"                             // gold rgba(255, 215, 0)
};

var order_scheme = {  // lowest number is in back, highest in front. 
                                    // This is actually not effective as a property, only through sorting of data
    "Self consumption" : 6,
    "Import" : 5,
    "Consumption" : 4,
    "Production" : 3,
    "Export" : 2,
    "Solar":1,
    "Yesterday": 0
};

var chart_solar = {};    // set globals to hold main charts
var chart_battery = {};
var inverter_data;   // store inverter data from web
var ChartSolar;
var ChartBattery;   // and inverter too!
//var app = angular.module("vapp", []); 
var summaryDataYesterday = {}; // Total up some key metrics for yesterday and today
var summaryDataToday = {};


Chart.pluginService.register({   // This creates the ability to color just the chart background ... chartArea
    beforeDraw: function (chart, easing) {
        if (chart.config.options.chartArea && chart.config.options.chartArea.backgroundColor) {
            var ctx = chart.chart.ctx;
            var chartArea = chart.chartArea;

            ctx.save();
            ctx.fillStyle = chart.config.options.chartArea.backgroundColor;
            ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
            ctx.restore();
        }
    }
});

///       functions       /////

function nowtime(offset) { // offset in hours, backwards in time. But only to beginning of yesterday, please.
    var d = new Date();
    if (offset != 0) {
        d.setHours(d.getHours() - offset);
        d.setDate(d.getDate() +1);
        d.setHours(0);
        d.setMinutes(0);
    }
    var n = d.toLocaleString('en-US', { hour12: false });  // good - needs formatting. remove comma, space, AM/PM 
                                                                                    // starts as 12/13/2020, 5:45:26 PM
    n = n.replace(/\//g, "-");
    n = n.replace(/ [AP]M/, "");
    n = n.replace(", ", "%20");
    y = d.getFullYear();
    n = n.replace( "-"+y, "");
    n = y + "-" + n;
    return n;
}

///           Senders, asking various solarEdge APIs for data. callbacks specify receiver functions.

function sender_flow () { // Fetch some top data like solar input right now, consumption, import, export
    
    var url = "https://monitoringapi.solaredge.com/site/";
    var api_function = "currentPowerFlow.json";
    var args = [
            "format=application/json", 
            "callback=responder_flow", 
            "api_key="+api_key
            ];
    var s = document.createElement("script");
    s.src = url + site_id + '/' + api_function + '?' + args.join("&");
    document.body.appendChild(s);
}
// function sender_solar (day) { // Fetch some top secret non-API data. Needs to be done for separate today and yest.
//     var milliseconds = ''; // for yesterday, set this at some time in yesterday.
//     if (day == 'yesterday') {
//         var y = new Date();
//         y.setDate((y.getDate())-1);
//         milliseconds = y.valueOf();
//     }
//     var url = "https://monitoring.solaredge.com/solaredge-apigw/api/site/";
//     var api_function = "powerDashboardChart";
//     var args = [
//             "chartField=DAY", 
//             "foldUp=true", 
//             "fieldId="+site_id,
//             "endDate=" + milliseconds
//             ];
//     var s = document.createElement("script");
//     s.src = url + site_id + '/' + api_function + '?' + args.join("&");
//     s.onload = solar_responder(s.innerHTML);
//     document.body.appendChild(s);
// }
// function solar_responder (payload) {
//     alert(payload);
//     if (solar_today == null) {
//         solar_today = payload;
//         sender_solar('yesterday');
//     }
//     else {
//         solar_yesterday = payload;
//     }
// }

function sender () {    
    var url = "https://monitoringapi.solaredge.com/site/";
    var api_function = "powerDetails.json";
    var args = [
            "format=application/json", 
            "timeUnit=QUARTER_OF_AN_HOUR", 
            "callback=responder", 
            "api_key="+api_key,
            "startTime="+timepast,
            "endTime="+timenow
            ];
    var s = document.createElement("script");
    s.src = url + site_id + '/' + api_function + '?' + args.join("&");
    document.body.appendChild(s);
    //alert("Sender called on " + s.src );
}
function sender_battery () {
    
    var url = "https://monitoringapi.solaredge.com/site/";
    var api_function = "storageData.json";
    var args = [
            "format=application/json", 
            "callback=responder_battery", 
            "api_key="+api_key,
            "startTime="+timepast,
            "endTime="+timenow
            ];
    var s = document.createElement("script");
    s.src = url + site_id + '/' + api_function + '?' + args.join("&");
    document.body.appendChild(s);
    //alert("sender_battery called on " + s.src );
}
function sender_inverter () {
    var url = "https://monitoringapi.solaredge.com/equipment/";
    var api_function = "data.json";
    var args = [
            "format=application/json", 
            "callback=responder_inverter", 
            "api_key="+api_key,
            "startTime="+timepast,
            "endTime="+timenow
            ];
    var s = document.createElement("script");
    s.src = url + site_id + '/' + inverter_serial + '/' + api_function + '?' + args.join("&");
    document.body.appendChild(s);
    //alert("sender_inverter called on " + s.src );
}

/////////   Done with senders,    on to responders   ////////////////////////

function responder_flow (payload) {
    var stringData = '<TABLE style="color: gray; margin: 10px; padding: 1; font-family:calibri,helvetica,sans-serif; font-size:12px; font-style: italic; "><TR><TD><TABLE>';
    var topData= document.getElementById('flowdata');
    var unit = payload.siteCurrentPowerFlow.unit;
    var pointers = payload.siteCurrentPowerFlow.connections;
    
    for (var i in pointers) {
        stringData += "<TR><TD>";
        stringData += pointers[i].from + " (";
        stringData += payload.siteCurrentPowerFlow[pointers[i].from].currentPower + unit + ")</TD><TD> ==> &nbsp;";
        stringData += pointers[i].to + ' (';
        stringData += payload.siteCurrentPowerFlow[pointers[i].to.toUpperCase()].currentPower + unit + ")</TD></TR>";
    }
    stringData += "<TR><TD colspan=2>Battery is at " + payload.siteCurrentPowerFlow.STORAGE.chargeLevel + '%</TD></TR>';
    stringData += "<TR><TD colspan=2>Now is: " + timenow.replace(/%20/, '  ') + '</TD></TR>';
    stringData += '</TABLE></TD><TD> &nbsp; &nbsp; <TD><TD id=summary_table><TD></TR></TABLE>';
    topData.innerHTML = stringData;
    //sender_solar('today');
    sender();
}
function responder (payload) {      ///      Solar power graph 1
    //alert("response is " + payload);
    // now I have the object, and can sift through it for the graph.
    var day_set = {};
    line_properties(day_set, "Yesterday");
    day_set.fill = true;

    var datasets = payload.powerDetails.meters; // "timeUnit":"QUARTER_OF_AN_HOUR","unit":"Wh","meters"
    chart_solar.label = []; // x axis values go here, in array exactly as long as data values
    chart_solar.datasets = []; // data structures go in here, including label for each meter type
    var saved_import = [];      // save ahead for self-consumption graph
    var first_set = 1;
    for (var i in datasets) { 
        var line_label = rename_scheme[datasets[i].type];
        if (line_label == "Production") { continue; } // Data is useless. inverter to consumption or export, but not battery
        var line_set = {};
        var yesterday = test_day(timepast, 'initialize'); // flag when we cross from yesterday to today
        line_properties(line_set, line_label);
        summaryDataYesterday[line_label] = 0;
        summaryDataToday[line_label] = 0;
        //
        var line_values = [];        
        var values = datasets[i].values;
        for (var j in values) { 
            yesterday = (test_day(values[j].date, yesterday));
            if (first_set) {
                chart_solar.label.push(values[j].date);
                if (yesterday) { day_set.data.push(-50); }
                else { } // leave today not black, chart works fine lacking points
            }
            line_values.push(Math.round(values[j].value)); // Quarter hour data needs to be cast as full hour for Y axis, energy only  4 * 
            if (line_label == "Import") {
                saved_import.push(Math.round(values[j].value)); // 4 *  - for energy, but not for power.
            }
            //
            var sumval = Number(values[j].value);
            if (!isNaN(sumval)) {
                if (yesterday) { summaryDataYesterday[line_label] += sumval/4; } // Divide by 4 for power, not for energy.
                else {               summaryDataToday[line_label] += sumval/4; }
            }
        }
        summaryDataYesterday[line_label] = parseInt(summaryDataYesterday[line_label]);
        summaryDataToday[line_label] = parseInt(summaryDataToday[line_label]);
        //
        line_set.data = line_values;
        chart_solar.datasets.push(line_set);
        first_set = 0;
    }
    chart_solar.datasets.push(day_set);
    // Now create extra graph/line for self-consumption, by calculation of consumption - import (saved)
    var calc_set = {};
    line_properties(calc_set, "Self consumption");
    
    var line_values = [];  
    for (var i in chart_solar.datasets) {
        var nowset = chart_solar.datasets[i];
        if (nowset.label == "Consumption") {
            var values = nowset.data;
            for (var j in values) {
                line_values.push( Math.round(values[j] - saved_import[j])); 
            }
        }
    }
    calc_set.data = line_values;
    chart_solar.datasets.push(calc_set);
    DrawChart();
    sender_inverter();  // chain all calls in orderly sequence.
}
////////////////////////////////////////                        BATTERY and INVERTER

function responder_battery (payload) {  //      Battery graph 2, but data is intermingled with inverter payload as well.
    //alert("response is " + payload);
    // now I have the object, and can sift through it for the graph.
    var full_capacity = payload.storageData.batteries[0].nameplate;
    var response_data = payload.storageData.batteries[0].telemetries; //  timeStamp, power, batteryPercentageState, etc
    chart_battery.label = [];       // x axis values go here, in array exactly as long as data values
    chart_battery.datasets = []; // data structures go in here, including label for each meter type
    //
    var fifteen_counter = 0; // set up counter to tick this data (5 min) vs the power data (15 min), for solar collection
    var solar_sum = 0; 
    var special_solar = [0];  // transfer a calculated dataset from the inverter graph to the power graph, 
                                    // as it does not otherwise get solar data. 
                                    // Advance by one click, since it otherwise ends up one point behind. 
                                    // Center of graph is off, though. We lose registration between the two graphs in any case.
    
    var fullPackEnergyAvailable = response_data[0].fullPackEnergyAvailable;
    // write out a bit of metadata
    var capacity = 100* (fullPackEnergyAvailable/full_capacity);
    document.getElementById('battery_meta_data').innerHTML 
        = "Battery capacity = " +fullPackEnergyAvailable+ "Wh / " + full_capacity + "Wh = " + capacity.toFixed(2) + "%";
    //
    var fill_set = {};
    line_properties(fill_set, "Fill state");
    fill_set.yAxisID = 'left-y-axis';
    fill_set.fill = false;
    //
    var power_set = {};
    line_properties(power_set, "Charging");
    power_set.yAxisID = 'right-y-axis';
    summaryDataYesterday['Charging'] = 0;
    summaryDataToday['Charging'] = 0;
    summaryDataYesterday['Discharging'] = 0;
    summaryDataToday['Discharging'] = 0;
    //
    var inverter_set = {};
    line_properties(inverter_set, "Inverter power");
    inverter_set.yAxisID = 'right-y-axis';
    summaryDataYesterday['Inverter'] = 0;
    summaryDataToday['Inverter'] = 0;

    var line_values = [];        
    
    var yesterday = test_day(timepast, 'initialize');

    for (var j in response_data) { 
        chart_battery.label.push( response_data[j].timeStamp );
        var battery_state = response_data[j].batteryPercentageState.toFixed(1)
        fill_set.data.push( battery_state );
        if (response_data[j] && response_data[j].power != null) {
            power_set.data.push( response_data[j].power.toFixed(1) );
        }
        if (inverter_data[j] && inverter_data[j].totalActivePower != null) {
            inverter_set.data.push(inverter_data[j].totalActivePower);
        }
        //inverter_set.data.push(inverter_data[j].totalActivePower);
        yesterday = (test_day(response_data[j].timeStamp, yesterday));
        var charge = Number(response_data[j].power);
        var inverternum = Number(inverter_data[j].totalActivePower);
        
        if (yesterday) {
            if (!isNaN(charge)) {
                if (charge >0 ) {
                    summaryDataYesterday['Charging'] += charge;
                    solar_sum += charge;
                }
                else {
                   summaryDataYesterday['Discharging'] += charge; 
                }
            }
            if (!isNaN(inverternum)) {
                summaryDataYesterday['Inverter'] += inverternum;
                if (inverternum > 0 && ( charge > 0 || battery_state == 100) ) {
                    solar_sum += inverternum;   // log this to solar if inverter is pos and battery is full or charging.
                }                
            }
        }
        else {
            if (!isNaN(charge)) {
                if (charge > 0 ) {
                    summaryDataToday['Charging'] += charge;
                    solar_sum += charge;
                }
                else {
                   summaryDataToday['Discharging'] += charge; 
                }
            }
            if (!isNaN(inverternum)) {
                summaryDataToday['Inverter'] += inverternum;
                if (inverternum > 0 && ( charge > 0 || battery_state == 100) ) {
                    solar_sum += inverternum;   // log this to solar if inverter is pos and battery is full or charging.
                }
            }
        }
        // solar
        fifteen_counter++;
        if (fifteen_counter > 2) {
            fifteen_counter = 0;
            special_solar.push(Math.round(solar_sum / 3));
            solar_sum = 0;
        }
    }
    summaryDataYesterday['Charging'] = Math.round(summaryDataYesterday['Charging']/12);
    summaryDataYesterday['Discharging'] = Math.round(summaryDataYesterday['Discharging']/12);
    summaryDataYesterday['Inverter'] = Math.round(summaryDataYesterday['Inverter']/12);
    summaryDataToday['Charging'] = Math.round(summaryDataToday['Charging']/12);
    summaryDataToday['Discharging'] = Math.round(summaryDataToday['Discharging']/12);
    summaryDataToday['Inverter'] = Math.round(summaryDataToday['Inverter']/12);
    //
    chart_battery.datasets.push(fill_set);
    chart_battery.datasets.push(power_set);
    chart_battery.datasets.push(inverter_set);
    DrawChartBattery();
    FillSummaries();
    // add line to solar
    var line_set = {};
    line_properties(line_set, "Solar");
    line_set.data = special_solar;
    ChartSolar.data.datasets.push(line_set);
    ChartSolar.update();
}

function responder_inverter (payload) {
    inverter_data = payload.data.telemetries; // array with all the data, assuming only one inverter(!)
    sender_battery();
}
function compare(a,b) { // Order property is not sufficient, the data array needs to be re-sorted.
    if (order_scheme[a.label] > order_scheme[b.label]) { return -1; }
    if (order_scheme[a.label] < order_scheme[b.label]) { return 1; }
    return 0;
}   

//////    Done with responders that set up the data, now chart it out  ////////
function DrawChart () { // top power chart
    chart1= document.getElementById('solar_power').getContext('2d');
    chart_solar.datasets.sort(compare);
    var oldChart = ChartSolar; // if exists, destroy below.
    ChartSolar = new Chart(chart1, {
        type: 'line',
        data:  {
            labels: chart_solar.label,
            datasets: chart_solar.datasets
        },
        options: {
            responsive: true,
            chartArea: { backgroundColor: 'Snow' }, // beige  WhiteSmoke  Linen  Snow
            legend: { 
                    display: true,
                    position: 'top',
                    reverse: false,
                    labels: {
                        fontSize: 12
                    }
                 },
            title: {
                display: true,
                text: chart_title
            },
            scales: {
                xAxes: [{
						scaleLabel: {
							display: true,
							labelString: 'Date * Time'
						},
						ticks: {
						    autoSkip: true,
						    maxRotation: 75 // This has sensitive effect on number of labels applied to X axis.
						}
                }],
                yAxes: [{
                    stacked: false,
                        scaleLabel: {
							display: true,
							labelString: 'Wh, on hourly basis'
						}
                }]
            },
        }
    });
    if (oldChart != null ) {
        oldChart.destroy(); // Destroy after drawing new one to minimize reflow disruptions.
    }
}

function DrawChartBattery () { // top power chart
    chart2= document.getElementById('solar_battery').getContext('2d');
    var oldChart = ChartBattery;
    ChartBattery = new Chart(chart2, {
        type: 'line',
        data:  {
            labels: chart_battery.label,
            datasets: chart_battery.datasets
        },
        options: {
            responsive: true,
            chartArea: { backgroundColor: 'lightcyan' },
            legend: { 
                    display: true,
                    position: 'top',
                    reverse: false,
                    labels: {
                        fontSize: 12
                    }
                 },
            title: {
                display: true,
                text: chart_battery_title
            },
            scales: {
                xAxes: [{
						scaleLabel: {
							display: true,
							labelString: 'Date * Time'
						},
						ticks: {
						    autoSkip: true,
						    maxRotation: 75 // This has sensitive effect on number of labels applied to X axis.
						}
                }],
                yAxes: [{
                    stacked: false,
                    ticks: {
                        min: 0,
                        max:100
                    },
                    id: 'left-y-axis',
                    position: 'left',
                    scaleLabel: {
                        display: true,
                        labelString: 'Percent filled'
					}
				},	{
                    stacked: false,
                    id: 'right-y-axis',
                    position: 'right',
                    scaleLabel: {
					    display: true,
						labelString: 'Watts charged or discharged'
					},
					gridLines: {
					    display: false
					}
                }]
            },
        }
    });
    if (oldChart != null ) {  // if not destroyed, chart sits under current one, with active hover events!
        oldChart.destroy(); // Destroy after drawing new one to minimize reflow disruptions.
    }
}

function FillSummaries () { /// calculate and show the summary data per day.
    var sumData= document.getElementById('summary_table');
    
    // Start with yesterday table
    var stringData = "<TABLE padding=4px><TR valign=top><TD><b><u>Yesterday:</u></b><br><TABLE>";
    var sortedY = Object.keys(summaryDataYesterday).sort();
    for (var i = 0; i < sortedY.length; i++) {
        stringData += "<TR><TD>"+ sortedY[i] + "</TD><TD> = </TD><TD align=right>" + summaryDataYesterday[sortedY[i]].toLocaleString() + ' Wh</TD></TR>';
    }  
    // Self-consumption is load minus import
    var selfY = summaryDataYesterday['Consumption'] - summaryDataYesterday['Import'];
    stringData += "<TR><TD>Self-consumption</TD><TD> = </TD><TD align=right>" + selfY.toLocaleString() + ' Wh</TD></TR>';
    // Solar incoming is roughly (over a whole day) battery charging + export .. plus some self-consumption (load - (import + discharging [negative sign]))
    var solarY = summaryDataYesterday['Export'] + summaryDataYesterday['Charging'] 
                    + (summaryDataYesterday['Consumption'] 
                            - summaryDataYesterday['Import'] 
                            + summaryDataYesterday['Discharging']) ;
    stringData += "<TR><TD>Solar production</TD><TD> = </TD><TD align=right>" + solarY.toLocaleString() + ' Wh</TD></TR>';

    // Now on to the TODAY table
    stringData += "</TABLE></TD><TD><b><u>Today:</u></b><br><TABLE>"; 
    
    //alert(JSON.stringify(summaryDataToday));
    var sortedT = Object.keys(summaryDataToday).sort();
    for (var i = 0; i < sortedT.length; i++) {
        stringData +=  "<TR><TD>"+ sortedT[i] + "</TD><TD> = </TD><TD align=right>" + summaryDataToday[sortedT[i]].toLocaleString() + ' Wh</TD></TR>';
    }   
    var selfT = summaryDataToday['Consumption'] - summaryDataToday['Import'];
    stringData += "<TR><TD>Self-consumption</TD><TD> = </TD><TD align=right>" + selfT.toLocaleString() + ' Wh</TD></TR>';
    var solarT = summaryDataToday['Export'] + summaryDataToday['Charging'] 
                    + (summaryDataToday['Consumption'] 
                            - summaryDataToday['Import'] 
                            + summaryDataToday['Discharging']) ;
    stringData += "<TR><TD>Solar production</TD><TD> = </TD><TD align=right>" + solarT.toLocaleString() + ' Wh</TD></TR>';

    
    stringData += "</TABLE></TD></TR></TABLE>";
    sumData.innerHTML = stringData;
}
  
function restack() { // rotates the order scheme, then redraws the chart
    var maxlayer = -1;
    for (layer in order_scheme) { maxlayer++; }
    for (layer in order_scheme) {
        if (order_scheme[layer]+1 > maxlayer) { order_scheme[layer] = 0; }
        else { order_scheme[layer] = order_scheme[layer]+1; } 
    }
    for (dset in chart_solar.datasets) {
        chart_solar.datasets[dset].order = order_scheme[chart_solar.datasets[dset].label];
    }
    DrawChart();
}
function test_day(chart_day, yesterday) {
    var matchray = [];
    matchray = chart_day.match(/\d+/g);
    var newday = parseInt(matchray[2]);
    //alert(matchray[2] + " from " + chart_day);
    if (yesterday) {
        if (newday == yesterday) { // if anything else, the day has switched
            return yesterday;
        }
        if (yesterday == 'initialize') {
            return newday;
        }
    }
    return 0;
}
function line_properties (dataray, label) { // prepare the chart data basics/structure
    dataray.label = label;
    dataray.fill = true;
    //dataray.order = order_scheme[label];
    dataray.backgroundColor = color_scheme_fill[label];
    //dataray.pointBackgroundColor = color_scheme[label];
    dataray.pointRadius = 0;
    dataray.pointHitRadius = 2;
    dataray.borderColor = color_scheme[label];   // the line itself
    dataray.borderWidth = 1;
    dataray.data = [];
}
function shiftDay (daysback) { // go back in time... first set time, store it, then reload page.
    var hoursback = 24 * daysback;
    timenow = nowtime(hoursback);
    timepast = nowtime(hoursback+48);  // supply number of hours back, then forward to start of next day.
    sender_flow();
}