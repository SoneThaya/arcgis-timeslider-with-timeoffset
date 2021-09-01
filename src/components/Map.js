import React, { useEffect, useRef } from "react";
import { loadModules } from "esri-loader";
import { Chart } from "chart.js";

const Map = () => {
  const MapEl = useRef(null);

  useEffect(() => {
    loadModules([
      "esri/Map",
      "esri/layers/FeatureLayer",
      "esri/views/MapView",
      "esri/widgets/Legend",
      "esri/widgets/Expand",
      "esri/widgets/TimeSlider",
      "esri/core/watchUtils",
      "esri/core/promiseUtils",
    ]).then(
      ([
        Map,
        FeatureLayer,
        MapView,
        Legend,
        Expand,
        TimeSlider,
        watchUtils,
        promiseUtils,
      ]) => {
        let timeSlider, firesChart;
        const map = new Map({
          basemap: {
            portalItem: {
              id: "4f2e99ba65e34bb8af49733d9778fb8e",
            },
          },
        });

        const view = new MapView({
          container: "viewDiv",
          map: map,
          zoom: 5,
          center: [-118, 37.49], // longitude, latitude
        });

        // create five new instances of feature layers
        // based on the following definitions
        const url =
          "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/California_fires_since_2014/FeatureServer/";
        const definitions = [
          { id: 0, year: 2014, offset: 4 },
          { id: 1, year: 2015, offset: 3 },
          { id: 2, year: 2016, offset: 2 },
          { id: 3, year: 2017, offset: 1 },
          { id: 4, year: 2018, offset: 0 },
        ];

        const layers = definitions.map((definition) => {
          return createLayer(definition);
        });
        // add the california fire layers
        map.addMany(layers);

        // get layerviews of each fire layers once the layers are loaded
        const layerViewsEachAlways = () => {
          return promiseUtils.eachAlways(
            layers.map((layer) => {
              return view.whenLayerView(layer);
            })
          );
        };

        view.when(() => {
          // create a new instance of timeslider
          timeSlider = new TimeSlider({
            container: "timeSliderDiv",
            view: view,
            fullTimeExtent: {
              start: new Date(2018, 0, 1),
              end: new Date(2018, 11, 1),
            },
            playRate: 2000,
            stops: {
              interval: {
                value: 1,
                unit: "months",
              },
            },
          });

          // update the fire stats between 2014 - 2018 once timeExtent of
          // the timeSlider changes
          timeSlider.watch("timeExtent", () => {
            updateFiresStats();
          });
          createFiresChart();
        });

        view.whenLayerView(layers[0]).then((layerView) => {
          watchUtils.whenFalseOnce(layerView, "updating", () => {
            updateFiresStats();
          });
        });

        // fire stats for each year between 2014 - 2018
        const sumAcres = {
          onStatisticField: "GIS_ACRES",
          outStatisticFieldName: "acres_sum",
          statisticType: "sum",
        };
        const fireCounts = {
          onStatisticField: "OBJECTID",
          outStatisticFieldName: "fire_counts",
          statisticType: "count",
        };
        const year = {
          onStatisticField: "ALARM_DATE",
          outStatisticFieldName: "year",
          statisticType: "max",
        };
        // stats query
        const statQuery = {
          outStatistics: [sumAcres, fireCounts, year],
        };

        // query five layerviews representing fires between 2014-2018
        // this will be called from the UudateFiresStats function
        const queryFeaturesForStats = (layerViewsResults) => {
          return promiseUtils.eachAlways(
            layerViewsResults.map((result) => {
              // If a Promise was rejected, you can check for the rejected error
              if (result.error) {
                return promiseUtils.resolve(result.error);
              }
              // The results of the Promise are returned in the value property
              else {
                const layerView = result.value;

                // set the timeExtent for the stats query object. But
                // we need to offset the timeExtent for each layer by
                // number of years specified in the layer.timeOffset
                let start = new Date(timeSlider.timeExtent.start);
                let end = new Date(timeSlider.timeExtent.end);
                start.setFullYear(
                  start.getFullYear() - layerView.layer.timeOffset.value
                );
                end.setFullYear(
                  end.getFullYear() - layerView.layer.timeOffset.value
                );

                // now we have the right timeExtent for each layer
                // set the timeExtent for the stats query
                statQuery.timeExtent = {
                  start: start,
                  end: end,
                };
                // query the layerviews for the stats
                return layerView.queryFeatures(statQuery).then(
                  (response) => {
                    return response.features[0].attributes;
                  },
                  (e) => {
                    return promiseUtils.resolve(e);
                  }
                );
              }
            })
          );
        };

        // This function is called when the timeSlider's timeExtent changes
        // It queries each layer view for fire stats and updates the chart
        function updateFiresStats() {
          layerViewsEachAlways().then((layerViewsResults) => {
            // query each and every fire layerviews for stats and process the results
            queryFeaturesForStats(layerViewsResults).then(
              (fireStatsQueryResults) => {
                monthDiv.innerHTML = "";
                let month;
                let acresBurntList = [];
                let chartLabels = [];
                // fire stats query results are back. Loop through them and process.
                fireStatsQueryResults.map((result) => {
                  if (result.error) {
                    return promiseUtils.resolve(result.error);
                  }
                  // The results of the Promise are returned in the value property
                  else {
                    // if the stats query returned a year for the given layerview
                    // then process and update the chart
                    if (result.value.year !== null) {
                      // extract the year and month from the date
                      let date = new Date(result.value.year);
                      let year = date.getFullYear();

                      // array of burnt acres sum returned in the query results
                      // for each layerview representing fires between 2014-2018
                      acresBurntList.push(result.value.acres_sum.toFixed(2));

                      //chart labels will show the year and count of fires for that year
                      const label = year + ", " + result.value.fire_counts;
                      chartLabels.push(label);
                    }
                  }
                });
                // query results have been processed. Update the fires chart to display
                // sum of acres burnt for the given month and year
                firesChart.data.datasets[0].data = acresBurntList;
                firesChart.data.labels = chartLabels;
                firesChart.update();
                let startMonth = timeSlider.timeExtent.start.toLocaleString(
                  "default",
                  { month: "long" }
                );
                let endMonth = timeSlider.timeExtent.end.toLocaleString(
                  "default",
                  {
                    month: "long",
                  }
                );
                monthDiv.innerHTML =
                  "<b> Month: <span>" +
                  startMonth +
                  " - " +
                  endMonth +
                  "</span></b>";
              }
            );
          });
        }

        // Creates five instances of feature layers each representing
        // fires for the given year (between 2014 - 2018)
        function createLayer(definition) {
          const year = definition.year;

          return new FeatureLayer({
            url: url + definition.id,
            timeOffset: {
              value: definition.offset,
              unit: "years",
            },
            outFields: ["*"],
            popupTemplate: {
              title: "{ALARM_DATE}",
              content: "{YEAR_}, {ALARM_DATE}, {GIS_ACRES}",
            },
          });
        }

        // create the legend
        const layerInfos = layers.map((layer, i) => {
          return {
            title: "",
            layer: layer,
          };
        });

        const legend = new Legend({
          view: view,
          layerInfos: layerInfos,
        });
        view.ui.add(legend, "top-left");

        // Fires chart section
        const monthDiv = document.getElementById("monthDiv");
        const infoDiv = document.getElementById("infoDiv");
        const chartCanvas = document.getElementById("fireChart");
        const infoDivExpand = new Expand({
          collapsedIconClass: "esri-icon-collapse",
          expandIconClass: "esri-icon-expand",
          expandTooltip: "Expand earthquakes info",
          view: view,
          content: infoDiv,
          expanded: true,
        });
        view.ui.add(infoDivExpand, "top-right");

        // create a bar chart to display sum of acres
        // burnt for the given month and year.
        function createFiresChart() {
          Chart.defaults.color = "#d1d1d1";
          firesChart = new Chart(chartCanvas.getContext("2d"), {
            type: "bar",
            data: {
              labels: [2014, 2015, 2016, 2017, 2018],
              datasets: [
                {
                  label: "Acres burnt, year, fire counts",
                  backgroundColor: "#ff642e",
                  data: [0, 0, 0, 0, 0],
                },
              ],
            },
            options: {
              responsive: false,
              legend: {
                position: "bottom",
              },
              title: {
                display: true,
                text: "Acres burnt by month",
                fontFamily:
                  "'Avenir Next W00','Helvetica Neue', Helvetica, Arial, sans-serif",
              },
              scales: {
                yAxes: [
                  {
                    ticks: {
                      beginAtZero: true,
                      callback: (value) => {
                        if (value % 1 === 0) {
                          return value;
                        }
                      },
                    },
                    gridLines: {
                      zeroLineColor: "#d1d1d1",
                      color: "#696969",
                    },
                  },
                ],
                xAxes: [
                  {
                    gridLines: {
                      zeroLineColor: "#d1d1d1",
                      color: "#696969",
                    },
                  },
                ],
              },
              tooltips: {
                callbacks: {
                  title: (tooltipItem, data) => {
                    return "Fire";
                  },
                  label: (tooltipItem, data) => {
                    const yearCount = tooltipItem.xLabel.split(",");
                    let customTooltip = [];
                    customTooltip.push("Year: " + yearCount[0]);
                    customTooltip.push("Count:" + yearCount[1]);
                    customTooltip.push("Acres:" + tooltipItem.yLabel);
                    return customTooltip;
                  },
                },
                displayColors: false,
              },
            },
          });
        }
      }
    );
  }, []);

  return (
    <>
      <div
        id="viewDiv"
        style={{ height: "100vh", width: "100vw" }}
        ref={MapEl}
      ></div>
      <div id="timeSliderDiv"></div>
      <div id="infoDiv" className="esri-widget">
        <div class="esri-widget__heading">
          <h4>California fires 2014 - 2018</h4>
        </div>
        <div id="monthDiv"></div>
        <br />
        <canvas
          id="fireChart"
          height="250"
          width="300"
          className="esri-widget"
        ></canvas>
      </div>
    </>
  );
};

export default Map;
