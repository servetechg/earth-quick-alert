export type MobileWeatherSnapshot = {
    temperatureF: number;
    condition: string;
    highF: number;
    lowF: number;
    humidity: number;
    windMph: number;
    locationLabel: string;
};

export type MobileForecastDay = {
    date: string;
    label: string;
    condition: string;
    highF: number;
    lowF: number;
};

export type MobileWeatherPreference = {
    id: string;
    label: string;
    enabled: boolean;
};
