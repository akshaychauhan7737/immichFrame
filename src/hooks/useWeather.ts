"use client";

import { useState, useEffect } from 'react';
import type { WeatherData, AirPollutionData } from '@/lib/types';
import { useToast } from './use-toast';

const LATITUDE = process.env.NEXT_PUBLIC_LATITUDE;
const LONGITUDE = process.env.NEXT_PUBLIC_LONGITUDE;
const OPENWEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useWeather() {
    const { toast } = useToast();
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [airPollution, setAirPollution] = useState<AirPollutionData | null>(null);

    useEffect(() => {
        if (!LATITUDE || !LONGITUDE || !OPENWEATHER_API_KEY) {
            console.warn("Weather widgets disabled: Location or OpenWeather API key is missing from environment variables.");
            return;
        }

        const fetchData = async () => {
            try {
                // Fetch weather and air pollution in parallel
                const [weatherResponse, airPollutionResponse] = await Promise.all([
                    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${OPENWEATHER_API_KEY}&units=metric`),
                    fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${OPENWEATHER_API_KEY}`)
                ]);

                if (weatherResponse.ok) {
                    const data = await weatherResponse.json();
                    setWeather({
                        temperature: Math.round(data.main.temp),
                        feelsLike: Math.round(data.main.feels_like),
                        weatherCode: data.weather[0].id,
                        description: data.weather[0].description,
                        windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
                        humidity: data.main.humidity,
                    });
                } else {
                    throw new Error('Failed to fetch weather data.');
                }
                
                if (airPollutionResponse.ok) {
                    const data = await airPollutionResponse.json();
                    if (data.list && data.list.length > 0) {
                        setAirPollution(data.list[0]);
                    }
                } else {
                    throw new Error('Failed to fetch air pollution data.');
                }

            } catch (e: any) {
                console.error("Failed to fetch weather/air pollution:", e);
                toast({
                    variant: 'destructive',
                    title: 'Weather Update Failed',
                    description: e.message,
                });
            }
        };
        
        fetchData();
        const interval = setInterval(fetchData, REFRESH_INTERVAL);

        return () => clearInterval(interval);
    }, [toast]);

    return { weather, airPollution };
}
