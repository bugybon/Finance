import React, { useEffect, useState } from 'react';
import { Chart, LineElement, Tooltip, LineController, CategoryScale, LinearScale, PointElement, Filler } from 'chart.js';
import AnnotationPlugin from 'chartjs-plugin-annotation';

import { query } from '../../Api';
import Card from "../Global/Card";
import LoadingView from "../Global/LoadingView";

import Parallel from '@/lib/parallel';

Chart.register(LineElement, Tooltip, LineController, CategoryScale, LinearScale, PointElement, Filler, AnnotationPlugin);

//Helper fucntions
//Sum of two numbers
function add(d){ 
    return d[0] + d[1];
}

function deltaSquared(x,y){
    return Math.pow(x - y, 2);
}

function deltaSquaredArray(arr1, arr2, i){
    return Math.pow(arr1[i] - arr2[i], 2);
}

export default function TrendMetric({ name, graphql_query, ranges, relation, show_standard_deviation }) {
    const [data, setData] = useState(null);
    const [selectedRange, setSelectedRange] = useState(ranges[0].key);
    const [chartRef, setChartRef] = useState(null);
    const [relationData, setRelationData] = useState([]);
    const [selectedRelationId, setSelectedRelationId] = useState(0);

    useEffect(() => {
        if(! relation) { return; }

        query(relation.graphql_query + `{ id ${relation.display_using} }`, null, 'CustomQuery')
            .then(({data}) => {
                setRelationData(data[relation.graphql_query])
                setSelectedRelationId(data[relation.graphql_query][0].id)
            })
            .catch(console.error)
    }, [])

    useEffect(() => {
        setData(null);

        if(relation) {
            if (selectedRelationId) {
                query(graphql_query + `(range: """${selectedRange}""" ${relation.foreign_key}: ${selectedRelationId})`, null, 'CustomQuery')
                    .then(({data}) => setData(JSON.parse(data[graphql_query])))
                    .catch(console.error)
            }

            return;
        }
        
        query(graphql_query, selectedRange)
            .then(({data}) => setData(JSON.parse(data[graphql_query])))
            .catch(console.error)
    }, [selectedRelationId, selectedRange])

    useEffect(() => {
        if(data == null) { return; }
        
        if(chartRef != null) {
            chartRef.destroy()
        }

        const average  = (values) => {
            if(values.length == 0) return 0;
            var p = new Parallel(values);
            return p.reduce(add) / values.length;
        }

        const standardDeviation = (values) => {
            if(values.length == 0) return 0;
            var p = new Parallel(values);

            const mean = average(values);

            let deltaSquaredMean = deltaSquared.bind(null, mean);

            return Math.sqrt(p.map(deltaSquaredMean).reduce(add) / (values.length-1)) - mean;
        }

        const standardDeviationAnnotations = () => {
            if(! show_standard_deviation) return [];
            const ctx_values = (ctx) => ctx.chart.data.datasets[0].data;
            return [
                {
                    type: 'line',
                    borderColor: 'rgba(102, 102, 102, 0.5)',
                    borderDash: [6, 6],
                    borderDashOffset: 0,
                    borderWidth: 2,
                    label: {
                      display: true,
                      backgroundColor: 'rgba(102, 102, 102, 0.5)',
                      color: 'black',
                      content: (average(ctx_values) + standardDeviation(ctx_values)).toFixed(2),
                      position: 'start',
                    },
                    scaleID: 'y',
                    value: average(ctx_values) + standardDeviation(ctx_values)
                },
                {
                    type: 'line',
                    borderColor: 'rgba(102, 102, 102, 0.5)',
                    borderDash: [6, 6],
                    borderDashOffset: 0,
                    borderWidth: 2,
                    label: {
                      display: true,
                      backgroundColor: 'rgba(102, 102, 102, 0.5)',
                      color: 'black',
                      content: (average(ctx_values) - standardDeviation(ctx_values)).toFixed(2),
                      position: 'end',
                    },
                    scaleID: 'y',
                    value: average(ctx_values) - standardDeviation(ctx_values)
                },
                {
                    type: 'line',
                    borderColor: '#3b82f6',
                    borderDash: [6, 6],
                    borderDashOffset: 0,
                    borderWidth: 2,
                    label: {
                      display: true,
                      backgroundColor: '#3b82f6',
                      content:  'Average: ' + average(ctx_values).toFixed(2)
                    },
                    scaleID: 'y',
                    value: average(ctx_values)
                }
            ];
        }

        const drawLinearRegressionLine = (data) => {
            let regressor = {};
            var p = new Parallel(data);

            let x_values = Array.from({ length: data.length }, (_, index) => index + 1);
            let y_values = p.map(function getValue(x) { return x.value;});
            let x_mean = average(x_values);
            let y_mean = average(y_values);
            
            let slope = 0, slope_numerator = 0, slope_denominator = 0;
            for(let i=0; i<x_values.length; i++){
                slope_numerator += (x_values[i]-x_mean)*(y_values[i]-y_mean);
            }

            let deltaSquaredXMean = deltaSquared.bind (null, x_mean);
            p = new Parallel(x_values);
            slope_denominator = p.map(deltaSquaredXMean).reduce(add);
            
            slope = slope_numerator/slope_denominator;

            regressor['slope'] = slope;
            let intercept = y_mean - x_mean*slope;

            regressor['intercept'] = intercept;

            let y_hat = [];
            for(let i=0; i<x_values.length; i++){
                y_hat.push(x_values[i]*regressor['slope']+regressor['intercept']);
            }

            regressor['y_hat'] = y_hat;
            
            let residual_sum_of_squares = 0, total_sum_of_squares = 0, r2 = 0;
            p = new Parallel(_.range(y_values.length));
            let deltaSquaredHatValues = deltaSquaredArray.bind(y_hat, y_values, null);
            residual_sum_of_squares = p.map(deltaSquaredHatValues).reduce(add);
            
            let deltaSquaredYMean = deltaSquared.bind (null, y_mean);
            p = new Parallel(y_hat);
            total_sum_of_squares = p.map(deltaSquaredYMean).reduce(add);
            
            r2 = 1- residual_sum_of_squares/total_sum_of_squares;
            
            regressor['r2'] = r2;

            return {
                type: 'line',
                label: 'Line of Best Fit (r2: '+String(r2)+')',
                data: y_hat,
                borderColor: '#eaeaea',
                pointRadius: 0,
                borderWidth: 2,
            }
        }

        const ctx = document.getElementById(graphql_query).getContext('2d');
        setChartRef(new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(item => item.label),
                datasets: [
                    {
                        data: data.map(item => item.value),
                        borderColor: '#0ea5e9',
                        backgroundColor: 'rgba(14, 165, 233, 0.2)',
                        pointHoverRadius: 8,
                        pointRadius: 6,
                        pointBackgroundColor: '#0ea5e9',
                        fill: 'start',
                        tension: 0.4,
                    },
                    drawLinearRegressionLine(data)
                ]
            },
            options: {
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 0,
                        right: 0,
                        bottom: 0,
                        top: 5
                    },
                    autoPadding: false
                },
                plugins: {
                    filler: {
                        propagate: false,
                    },
                    tooltip: {
                        displayColors: false,
                        backgroundColor: '#fff',
                        borderColor: '#0ea5e9',
                        borderWidth: 1,
                        titleColor: '#0ea5e9',
                        bodyColor: '#0ea5e9',
                        xAlign: 'center',
                        yAlign: 'center',
                    },
                    annotation: {
                        annotations: {
                            ...standardDeviationAnnotations()
                        }
                    }
                },
                scales: {
                    y: {
                      display: false,
                      beginAtZero: true,
                      grid: {
                        display: false,
                      },
                    },
                    x: {
                        display: false,
                        grid: {
                          display: false
                        },
                    }
                },
            }
        }));
    }, [data]);

    if(data == null) {
        return (
            <Card className="relative">
                <LoadingView  />
            </Card>
        )
    }
    
    return ( 
        <Card className="relative overflow-hidden">
            <div className="px-6 py-4">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center">
                        <h3 className="mr-2 text-base text-gray-700 font-bold">{ name }</h3>

                        {relation && relationData && <select className="ml-auto min-w-24 h-8 text-xs border-none appearance-none pl-2 pr-6 active:outline-none active:shadow-outline focus:outline-none focus:shadow-outline"
                            name="relation"
                            value={selectedRelationId}
                            onChange={(e) => {setSelectedRelationId(e.target.value)}}>
                            {relationData.map(relationItem => <option key={relationItem.id} value={relationItem.id}>{relationItem[relation.display_using]}</option>)}
                        </select>}
                    </div>

                    <select className="ml-auto min-w-24 h-8 text-xs border-none appearance-none bg-gray-100 pl-2 pr-6 rounded active:outline-none active:shadow-outline focus:outline-none focus:shadow-outline"
                        name="range"
                        value={selectedRange}
                        onChange={(e) => {setSelectedRange(e.target.value)}}>
                        {ranges.map(range => <option key={range.key} value={range.key}>{range.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="absolute w-full left-0 right-0 bottom-0 h-20">
                <canvas id={graphql_query}></canvas>
            </div>
        </Card>
    );
}