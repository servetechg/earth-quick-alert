/**
 * Canonical NWS weather alert types offered to citizens for subscription toggles.
 * Keep in sync with Alerts & Communication “NWS National Alerts” catalog.
 */
export type NwsWeatherAlertCategory =
    | 'Severe'
    | 'Winter'
    | 'Coastal'
    | 'Fire/Heat'
    | 'Other';

export type NwsWeatherAlertTypeDef = {
    id: string;
    name: string;
    severity: string;
    category: NwsWeatherAlertCategory;
    description: string;
};

export const NWS_WEATHER_ALERT_TYPES: readonly NwsWeatherAlertTypeDef[] = [
    // Severe Weather
    {
        id: 'tornado_warning',
        name: 'Tornado Warning',
        severity: 'Extreme',
        category: 'Severe',
        description: 'Immediate danger — a tornado has been sighted or indicated by radar.',
    },
    {
        id: 'tornado_watch',
        name: 'Tornado Watch',
        severity: 'High',
        category: 'Severe',
        description: 'Conditions favor tornadoes. Stay weather-aware.',
    },
    {
        id: 'severe_thunderstorm_warning',
        name: 'Severe Thunderstorm Warning',
        severity: 'Severe',
        category: 'Severe',
        description: 'Damaging winds or large hail are occurring or imminent.',
    },
    {
        id: 'severe_thunderstorm_watch',
        name: 'Severe Thunderstorm Watch',
        severity: 'High',
        category: 'Severe',
        description: 'Severe thunderstorms are possible in your area.',
    },
    {
        id: 'flash_flood_warning',
        name: 'Flash Flood Warning',
        severity: 'Severe',
        category: 'Severe',
        description: 'Life-threatening flash flooding is occurring or imminent.',
    },
    {
        id: 'flash_flood_watch',
        name: 'Flash Flood Watch',
        severity: 'High',
        category: 'Severe',
        description: 'Flash flooding is possible. Be ready to move to higher ground.',
    },
    {
        id: 'flood_warning',
        name: 'Flood Warning',
        severity: 'Moderate',
        category: 'Severe',
        description: 'Flooding is occurring or imminent along rivers or streams.',
    },
    {
        id: 'flood_watch',
        name: 'Flood Watch',
        severity: 'Moderate',
        category: 'Severe',
        description: 'Flooding is possible. Monitor local conditions.',
    },
    {
        id: 'flood_advisory',
        name: 'Flood Advisory',
        severity: 'Moderate',
        category: 'Severe',
        description: 'Minor flooding expected that may inconvenience travel.',
    },

    // Winter Hazards
    {
        id: 'blizzard_warning',
        name: 'Blizzard Warning',
        severity: 'Extreme',
        category: 'Winter',
        description: 'Blizzard conditions with low visibility and strong winds.',
    },
    {
        id: 'winter_storm_warning',
        name: 'Winter Storm Warning',
        severity: 'High',
        category: 'Winter',
        description: 'Hazardous snow, ice, or sleet is expected or occurring.',
    },
    {
        id: 'winter_storm_watch',
        name: 'Winter Storm Watch',
        severity: 'Moderate',
        category: 'Winter',
        description: 'Significant winter weather is possible.',
    },
    {
        id: 'winter_weather_advisory',
        name: 'Winter Weather Advisory',
        severity: 'Moderate',
        category: 'Winter',
        description: 'Snow, ice, or freezing rain that may cause travel impacts.',
    },
    {
        id: 'ice_storm_warning',
        name: 'Ice Storm Warning',
        severity: 'High',
        category: 'Winter',
        description: 'Damaging ice accumulation expected.',
    },
    {
        id: 'extreme_cold_warning',
        name: 'Extreme Cold Warning',
        severity: 'High',
        category: 'Winter',
        description: 'Dangerously cold temperatures or wind chill.',
    },
    {
        id: 'freeze_watch',
        name: 'Freeze Watch',
        severity: 'Moderate',
        category: 'Winter',
        description: 'Freezing temperatures that may damage crops or pipes are possible.',
    },

    // Coastal & Marine
    {
        id: 'hurricane_warning',
        name: 'Hurricane Warning',
        severity: 'Extreme',
        category: 'Coastal',
        description: 'Hurricane conditions expected within 36 hours.',
    },
    {
        id: 'hurricane_watch',
        name: 'Hurricane Watch',
        severity: 'High',
        category: 'Coastal',
        description: 'Hurricane conditions are possible within 48 hours.',
    },
    {
        id: 'tropical_storm_warning',
        name: 'Tropical Storm Warning',
        severity: 'High',
        category: 'Coastal',
        description: 'Tropical storm conditions expected within 36 hours.',
    },
    {
        id: 'tsunami_warning',
        name: 'Tsunami Warning',
        severity: 'Extreme',
        category: 'Coastal',
        description: 'A tsunami with significant inundation is imminent or expected.',
    },
    {
        id: 'coastal_flood_warning',
        name: 'Coastal Flood Warning',
        severity: 'High',
        category: 'Coastal',
        description: 'Coastal flooding is occurring or imminent.',
    },
    {
        id: 'coastal_flood_advisory',
        name: 'Coastal Flood Advisory',
        severity: 'Moderate',
        category: 'Coastal',
        description: 'Minor coastal flooding expected.',
    },
    {
        id: 'special_marine_warning',
        name: 'Special Marine Warning',
        severity: 'High',
        category: 'Coastal',
        description: 'Sudden marine hazards such as thunderstorms or waterspouts.',
    },
    {
        id: 'small_craft_advisory',
        name: 'Small Craft Advisory',
        severity: 'Moderate',
        category: 'Coastal',
        description: 'Hazardous conditions for small boats.',
    },
    {
        id: 'rip_current_statement',
        name: 'Rip Current Statement',
        severity: 'Moderate',
        category: 'Coastal',
        description: 'Dangerous rip currents along beaches.',
    },

    // Fire & Heat
    {
        id: 'fire_weather_warning',
        name: 'Red Flag Warning',
        severity: 'High',
        category: 'Fire/Heat',
        description: 'Critical fire weather conditions — high risk of rapid fire growth.',
    },
    {
        id: 'fire_weather_watch',
        name: 'Fire Weather Watch',
        severity: 'Moderate',
        category: 'Fire/Heat',
        description: 'Critical fire weather conditions are possible.',
    },
    {
        id: 'excessive_heat_warning',
        name: 'Excessive Heat Warning',
        severity: 'Extreme',
        category: 'Fire/Heat',
        description: 'Dangerously hot conditions that can cause heat illness.',
    },
    {
        id: 'heat_advisory',
        name: 'Heat Advisory',
        severity: 'Moderate',
        category: 'Fire/Heat',
        description: 'Hot conditions that may cause heat-related illness.',
    },

    // Wind & Other
    {
        id: 'high_wind_warning',
        name: 'High Wind Warning',
        severity: 'High',
        category: 'Other',
        description: 'Damaging high winds expected or occurring.',
    },
    {
        id: 'high_wind_watch',
        name: 'High Wind Watch',
        severity: 'Moderate',
        category: 'Other',
        description: 'Damaging high winds are possible.',
    },
    {
        id: 'wind_advisory',
        name: 'Wind Advisory',
        severity: 'Moderate',
        category: 'Other',
        description: 'Strong winds that may create travel or outdoor hazards.',
    },
    {
        id: 'lake_wind_advisory',
        name: 'Lake Wind Advisory',
        severity: 'Moderate',
        category: 'Other',
        description: 'Strong winds expected over lakes.',
    },
    {
        id: 'dust_storm_warning',
        name: 'Dust Storm Warning',
        severity: 'High',
        category: 'Other',
        description: 'Blinding dust with sudden low visibility.',
    },
    {
        id: 'air_quality_alert',
        name: 'Air Quality Alert',
        severity: 'Low',
        category: 'Other',
        description: 'Unhealthy air quality for sensitive groups or the public.',
    },
    {
        id: 'air_stagnation_advisory',
        name: 'Air Stagnation Advisory',
        severity: 'Low',
        category: 'Other',
        description: 'Limited air movement that may trap pollutants.',
    },
    {
        id: 'special_weather_statement',
        name: 'Special Weather Statement',
        severity: 'Low',
        category: 'Other',
        description: 'Notable weather that does not meet watch/warning criteria.',
    },
] as const;

/** Map preference id → official NWS event name (for alert matching). */
export const NWS_WEATHER_ALERT_EVENT_BY_ID: ReadonlyMap<string, string> = new Map(
    NWS_WEATHER_ALERT_TYPES.map((t) => [t.id, t.name]),
);
