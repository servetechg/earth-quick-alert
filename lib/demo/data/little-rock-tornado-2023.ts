/**
 * Authoritative facts: NWS Little Rock (LZK) survey, NCEI Storm Events, Wikipedia cross-check.
 * Event: EF-3 tornado — March 31, 2023, Pulaski & Lonoke counties, AR.
 */

export const LITTLE_ROCK_TORNADO_2023 = {
    id: 'demo-lrk-tornado-2023-03-31',
    externalId: 'demo-lrk-tornado-2023-03-31',
    name: 'Tornado Emergency — Little Rock Metro (EF-3)',
    shortName: '2023 Little Rock EF-3 Tornado',
    category: 'storm' as const,
    source: 'manual' as const,
    severity: 'Extreme' as const,
    type: 'Warning' as const,
    status: 'Take Action' as const,
    iconType: 'triangle' as const,
    /** ISO — 2023-03-31 19:18 UTC = 2:18 PM CDT touch down */
    issuedAt: '2023-03-31T19:18:00.000Z',
    /** 2023-03-31 19:58 UTC = 2:58 PM CDT dissipation */
    expiresAt: '2023-03-31T19:58:00.000Z',
    location:
        'Martindale, Chenal Valley, Breckenridge, Cammack Village, North Little Rock, Sherwood, Jacksonville — Pulaski & Lonoke Counties, AR',
    lat: 34.7465,
    lng: -92.2896,
    counties: ['Pulaski', 'Lonoke'],
    state: 'Arkansas',
    stateCode: 'AR',
    rating: {
        ef: 3,
        peakWindMph: 165,
        pathLengthMiles: 34.44,
        maxWidthYards: 600,
        durationMinutes: 40,
    },
    impacts: {
        injuriesDirect: 54,
        fatalitiesDirect: 0,
        fatalitiesIndirect: 1,
        structuresDamagedOrDestroyed: 2648,
        propertyDamageUsd: 90_000_000,
        insurancePayoutsUsd: 489_000_000,
        massCasualtyDeclared: true,
    },
    meteorology: {
        spcRisk: 'High (5/5)',
        outlookDate: '2023-03-31',
        mlCapeJkg: '1500–2500',
        stormRelativeHelicity: '300–600 m²/s²',
        warningIssuedCdt: '2:03 PM CDT (Pulaski County)',
        tornadoEmergency: 'Metro Little Rock (Cammack Village segment)',
    },
    affectedAreas: [
        'Martindale',
        'Chenal Valley',
        'Breckenridge',
        'Walnut Valley',
        'Cammack Village',
        'North Little Rock',
        'Amboy',
        'Indian Hills',
        'Sherwood',
        'Jacksonville',
        'Parnell',
    ],
    instructions: [
        'Take shelter immediately in an interior room on the lowest floor, away from windows.',
        'Expect widespread power outages, debris on roadways, and emergency vehicle activity in Pulaski County.',
        'Do not drive into damaged areas; allow first responders to clear major corridors (I-430, I-40, US-67).',
        'Monitor NWS Little Rock for continued severe weather during the March 31, 2023 outbreak.',
    ],
    description:
        'High-end EF-3 tornado tracked 34.44 miles across the Little Rock metropolitan area on March 31, 2023, ' +
        'with peak winds of 165 mph and a maximum path width of 600 yards. The tornado caused major structural damage ' +
        'from western Little Rock through North Little Rock, Sherwood, and Jacksonville, destroying or damaging 2,648 ' +
        'structures and injuring 54 people. NWS Little Rock issued a tornado emergency as the circulation impacted ' +
        'Cammack Village and approached the NWS office at North Little Rock Municipal Airport.',
    /** Approximate survey path (WGS84) for map polyline — west → east along NWS track */
    pathCoordinates: [
        [34.729, -92.406],
        [34.738, -92.448],
        [34.748, -92.456],
        [34.758, -92.438],
        [34.765, -92.418],
        [34.771, -92.388],
        [34.778, -92.365],
        [34.769, -92.355],
        [34.792, -92.265],
        [34.805, -92.235],
        [34.815, -92.215],
        [34.848, -92.155],
        [34.866, -92.125],
        [34.892, -92.085],
        [34.915, -92.045],
    ] as [number, number][],
    properties: {
        storm: {
            eventType: 'Tornado',
            efRating: 3,
            maxWindMph: 165,
            pathLengthMiles: 34.44,
            maxWidthYards: 600,
            durationMinutes: 40,
            injuries: 54,
            fatalitiesDirect: 0,
            fatalitiesIndirect: 1,
            structuresAffected: 2648,
            propertyDamageUsd: 90_000_000,
            counties: ['Pulaski', 'Lonoke'],
            outbreak: 'Tornado outbreak of March 31 – April 1, 2023',
            nwsOffice: 'NWS Little Rock (LZK)',
        },
    },
} as const;

/** Chronological NWS / EOC products for the March 31, 2023 outbreak (demo feed). */
export const DEMO_SUPPORTING_EVENTS = [
    {
        id: 'demo-lrk-spc-outlook-2023-03-31',
        externalId: 'demo-lrk-spc-outlook-2023-03-31',
        name: 'SPC High Risk Convective Outlook — Arkansas',
        category: 'storm' as const,
        source: 'manual' as const,
        severity: 'High' as const,
        type: 'Statement' as const,
        status: 'Monitor' as const,
        iconType: 'lightning' as const,
        issuedAt: '2023-03-31T12:00:00.000Z',
        expiresAt: '2023-03-31T23:59:00.000Z',
        location: 'Central and western Arkansas',
        lat: 34.75,
        lng: -92.5,
        description:
            'Storm Prediction Center outlined High Risk (level 5/5) over much of central and western Arkansas for March 31, 2023, ' +
            'with potential for strong long-track tornadoes including the Little Rock metro. Moderate risk (4/5) contour extended ' +
            'across eastern Oklahoma into western Arkansas ahead of the afternoon supercell initiation.',
        instructions: [
            'Activate EOC coordination channels and verify redundant communications.',
            'Brief sub-admin license holders on elevated tornado probabilities west of I-430.',
        ],
        properties: {
            storm: {
                eventType: 'SPC Outlook',
                spcRisk: 'High (5/5)',
                moderateRiskContour: '4/5 western AR',
            },
        },
    },
    {
        id: 'demo-lrk-tornado-watch-2023-03-31',
        externalId: 'demo-lrk-tornado-watch-2023-03-31',
        name: 'Tornado Watch — Central & Western Arkansas',
        category: 'storm' as const,
        source: 'nws' as const,
        severity: 'High' as const,
        type: 'Watch' as const,
        status: 'Get Prepared' as const,
        iconType: 'triangle' as const,
        issuedAt: '2023-03-31T17:30:00.000Z',
        expiresAt: '2023-03-31T23:00:00.000Z',
        location: 'Central and western Arkansas including Pulaski, Saline, Lonoke counties',
        lat: 34.81,
        lng: -92.35,
        description:
            'SPC Day 1 High Risk outlook with long-track, potentially violent tornadoes expected across central Arkansas. ' +
            'Environment supports MLCAPE 1500–2500 J/kg and storm-relative helicity 300–600 m²/s². Watch box covers ' +
            'Pulaski, Saline, Lonoke, Faulkner, and Perry counties through late evening.',
        instructions: [
            'Review shelter locations and ensure Ready2Go users can receive warnings.',
            'Pre-position responders and monitor supercell development west of Little Rock.',
        ],
        properties: {
            storm: {
                eventType: 'Tornado Watch',
                spcRisk: 'High',
                outlookDate: '2023-03-31',
                watchNumber: 'Watch #123 (demo)',
            },
        },
    },
    {
        id: 'demo-lrk-garland-funnel-2023-03-31',
        externalId: 'demo-lrk-garland-funnel-2023-03-31',
        name: 'Special Weather Statement — Garland Funnel Cloud (1:18 PM CDT)',
        category: 'storm' as const,
        source: 'nws' as const,
        severity: 'Moderate' as const,
        type: 'Statement' as const,
        status: 'Monitor' as const,
        iconType: 'cloud' as const,
        issuedAt: '2023-03-31T18:18:00.000Z',
        expiresAt: '2023-03-31T19:00:00.000Z',
        location: 'Garland / western Little Rock, Pulaski County, AR',
        lat: 34.735,
        lng: -92.445,
        description:
            'NWS Little Rock reported a funnel cloud near Garland in western Little Rock at approximately 1:18 PM CDT, ' +
            'roughly one hour before the confirmed EF-3 tornado touched down in Martindale. Spotters noted rapid rotation ' +
            'along the leading edge of the supercell moving east toward Chenal Valley.',
        instructions: [
            'Increase spotter network reporting along Chenal Parkway and I-430 corridor.',
            'Prepare to escalate to Tornado Warning if rotation persists at low levels.',
        ],
        properties: {
            storm: {
                eventType: 'Special Weather Statement',
                observedTimeCdt: '1:18 PM CDT',
                precursorTo: 'EF-3 Martindale touchdown (2:18 PM CDT)',
            },
        },
    },
    {
        id: 'demo-lrk-tornado-warning-pulaski-2023-03-31',
        externalId: 'demo-lrk-tornado-warning-pulaski-2023-03-31',
        name: 'Tornado Warning — Pulaski County (2:03 PM CDT)',
        category: 'storm' as const,
        source: 'nws' as const,
        severity: 'Extreme' as const,
        type: 'Warning' as const,
        status: 'Take Action' as const,
        iconType: 'triangle' as const,
        issuedAt: '2023-03-31T19:03:00.000Z',
        expiresAt: '2023-03-31T20:00:00.000Z',
        location: 'Pulaski County including Little Rock, Cammack Village, North Little Rock',
        lat: 34.746,
        lng: -92.35,
        description:
            'NWS Little Rock issued a Tornado Warning for Pulaski County at 2:03 PM CDT based on radar-indicated rotation ' +
            'and spotter reports west of downtown Little Rock. Warning preceded confirmed tornado touchdown in Martindale ' +
            'by approximately 15 minutes. Polygon included Chenal Valley, Breckenridge, and western metro corridors.',
        instructions: [
            'Take shelter immediately in an interior room on the lowest floor.',
            'Push Ready2Go shelter-in-place alerts to all Pulaski County license users.',
        ],
        properties: {
            storm: {
                eventType: 'Tornado Warning',
                issuedCdt: '2:03 PM CDT',
                nwsOffice: 'NWS Little Rock (LZK)',
                polygonCounties: ['Pulaski'],
            },
        },
    },
    {
        id: 'demo-lrk-tornado-emergency-cammack-2023-03-31',
        externalId: 'demo-lrk-tornado-emergency-cammack-2023-03-31',
        name: 'Tornado Emergency — Cammack Village / Metro Little Rock',
        category: 'storm' as const,
        source: 'nws' as const,
        severity: 'Extreme' as const,
        type: 'Warning' as const,
        status: 'Take Action' as const,
        iconType: 'triangle' as const,
        issuedAt: '2023-03-31T19:28:00.000Z',
        expiresAt: '2023-03-31T19:45:00.000Z',
        location: 'Cammack Village, Breckenridge, North Little Rock Municipal Airport area',
        lat: 34.778,
        lng: -92.365,
        description:
            'NWS Little Rock upgraded to a Tornado Emergency as a confirmed large and destructive tornado moved through ' +
            'Cammack Village toward the NWS forecast office at North Little Rock Municipal Airport. This is a particularly ' +
            'dangerous situation with a confirmed violent tornado on the ground in a densely populated urban area.',
        instructions: [
            'If you are in the path, take cover NOW in a basement or interior room.',
            'NWS LZK staff executed take-cover procedures; warning responsibility transferred to NWS Memphis briefly.',
        ],
        properties: {
            storm: {
                eventType: 'Tornado Emergency',
                segment: 'Cammack Village',
                nwsOfficeTakeCover: true,
                warningHandoff: 'NWS Memphis (LZK)',
            },
        },
    },
    {
        id: 'demo-lrk-ef3-peak-breckenridge-2023-03-31',
        externalId: 'demo-lrk-ef3-peak-breckenridge-2023-03-31',
        name: 'Confirmed EF-3 — Peak Winds Breckenridge Segment',
        category: 'storm' as const,
        source: 'manual' as const,
        severity: 'Extreme' as const,
        type: 'Statement' as const,
        status: 'Take Action' as const,
        iconType: 'triangle' as const,
        issuedAt: '2023-03-31T19:32:00.000Z',
        expiresAt: '2023-03-31T19:50:00.000Z',
        location: 'Breckenridge, Chenal Valley, western Little Rock, AR',
        lat: 34.768,
        lng: -92.395,
        description:
            'Post-event NWS survey confirmed EF-3 damage in the Breckenridge and Chenal Valley segment with estimated peak winds ' +
            'of 165 mph. Major structural damage to Calais Forest and Turtle Creek apartment complexes along Chenal Parkway. ' +
            '588 structures in this segment classified as major damage or destroyed per city damage assessments.',
        instructions: [
            'Deploy urban search and rescue to Breckenridge and Chenal Parkway commercial corridor.',
            'Establish triage at nearest hospitals — Baptist Health and UAMS reporting surge.',
        ],
        properties: {
            storm: {
                eventType: 'Survey Segment',
                efRating: 3,
                peakWindMph: 165,
                majorDamageStructures: 588,
                notableSites: ['Calais Forest', 'Turtle Creek', 'Chenal Parkway'],
            },
        },
    },
    {
        id: 'demo-lrk-tornado-emergency-sherwood-2023-03-31',
        externalId: 'demo-lrk-tornado-emergency-sherwood-2023-03-31',
        name: 'Tornado Emergency — Sherwood / Jacksonville Corridor',
        category: 'storm' as const,
        source: 'nws' as const,
        severity: 'Extreme' as const,
        type: 'Warning' as const,
        status: 'Take Action' as const,
        iconType: 'triangle' as const,
        issuedAt: '2023-03-31T19:42:00.000Z',
        expiresAt: '2023-03-31T20:05:00.000Z',
        location: 'Sherwood, Indian Hills, Jacksonville, Lonoke County, AR',
        lat: 34.815,
        lng: -92.22,
        description:
            'Tornado Emergency issued as the long-track EF-3 circulation continued east through Sherwood and into Jacksonville ' +
            'in Lonoke County. Path width reached 600 yards in this segment. Residential subdivisions and commercial strips ' +
            'along US-67 sustained significant damage before dissipation near Parnell.',
        instructions: [
            'Extend shelter alerts to Lonoke County Ready2Go users east of North Little Rock.',
            'Stage EMS along US-67 and I-440 interchange for post-pass search operations.',
        ],
        properties: {
            storm: {
                eventType: 'Tornado Emergency',
                segment: 'Sherwood → Jacksonville',
                maxWidthYards: 600,
                counties: ['Pulaski', 'Lonoke'],
            },
        },
    },
    {
        id: 'demo-lrk-mass-casualty-2023-03-31',
        externalId: 'demo-lrk-mass-casualty-2023-03-31',
        name: 'Mass Casualty Incident Declared — Pulaski County',
        category: 'hazardous' as const,
        source: 'manual' as const,
        severity: 'Extreme' as const,
        type: 'Advisory' as const,
        status: 'Take Action' as const,
        iconType: 'wind' as const,
        issuedAt: '2023-03-31T20:05:00.000Z',
        expiresAt: '2023-04-01T12:00:00.000Z',
        location: 'Little Rock, North Little Rock, Sherwood, Pulaski County, AR',
        lat: 34.746,
        lng: -92.29,
        description:
            'Arkansas Department of Health and regional hospitals declared a mass casualty event following the EF-3 tornado. ' +
            'Initial reports suggested up to 600 injuries; verified direct tornado injuries totaled 54 with one indirect fatality. ' +
            'Trauma centers activated surge protocols; mutual aid requested from surrounding counties.',
        instructions: [
            'Open Virtual EOC medical branch and track bed availability at Baptist, UAMS, and CHI St. Vincent.',
            'Coordinate ambulance staging at I-430 and I-40 corridor exits.',
        ],
        properties: {
            hazardous: {
                hazardType: 'Mass Casualty',
                injuriesDirect: 54,
                injuriesInitialEstimate: 600,
                fatalitiesIndirect: 1,
            },
        },
    },
    {
        id: 'demo-lrk-walnut-valley-damage-2023-03-31',
        externalId: 'demo-lrk-walnut-valley-damage-2023-03-31',
        name: 'Structural Damage Assessment — Walnut Valley / Amboy',
        category: 'hazardous' as const,
        source: 'manual' as const,
        severity: 'High' as const,
        type: 'Advisory' as const,
        status: 'Monitor' as const,
        iconType: 'wind' as const,
        issuedAt: '2023-03-31T20:15:00.000Z',
        expiresAt: '2023-04-03T23:59:00.000Z',
        location: 'Walnut Valley, Amboy, North Little Rock, AR',
        lat: 34.785,
        lng: -92.265,
        description:
            'Rapid damage assessments in Walnut Valley and Amboy documented widespread residential destruction along the ' +
            'eastern metro segment of the tornado track. Multiple single-family homes destroyed; access limited by downed ' +
            'trees on neighborhood streets. Part of the 2,648 total structures damaged or destroyed across the full path.',
        instructions: [
            'Prioritize welfare checks in Walnut Valley subdivisions with limited egress.',
            'Mark unsafe structures for engineer review before re-entry.',
        ],
        properties: {
            hazardous: {
                hazardType: 'Structural Damage',
                neighborhood: 'Walnut Valley / Amboy',
                pathSegment: 'Eastern Pulaski County',
            },
        },
    },
    {
        id: 'demo-lrk-nlr-curfew-2023-03-31',
        externalId: 'demo-lrk-nlr-curfew-2023-03-31',
        name: 'Emergency Curfew — North Little Rock',
        category: 'hazardous' as const,
        source: 'manual' as const,
        severity: 'Moderate' as const,
        type: 'Advisory' as const,
        status: 'Monitor' as const,
        iconType: 'wind' as const,
        issuedAt: '2023-03-31T21:00:00.000Z',
        expiresAt: '2023-04-02T06:00:00.000Z',
        location: 'North Little Rock, Pulaski County, AR',
        lat: 34.769,
        lng: -92.267,
        description:
            'City of North Little Rock enacted an emergency curfew following tornado damage to facilitate search and rescue, ' +
            'debris clearance, and utility restoration. Non-essential travel prohibited in damaged zones overnight.',
        instructions: [
            'Communicate curfew boundaries via Ready2Go push and SMS.',
            'Coordinate with law enforcement on checkpoint locations at major corridor intersections.',
        ],
        properties: {
            hazardous: {
                hazardType: 'Curfew',
                jurisdiction: 'North Little Rock',
            },
        },
    },
    {
        id: 'demo-lrk-power-debris-2023-03-31',
        externalId: 'demo-lrk-power-debris-2023-03-31',
        name: 'Widespread Power Outages & Debris — Pulaski County',
        category: 'hazardous' as const,
        source: 'manual' as const,
        severity: 'Moderate' as const,
        type: 'Advisory' as const,
        status: 'Monitor' as const,
        iconType: 'wind' as const,
        issuedAt: '2023-03-31T20:00:00.000Z',
        expiresAt: '2023-04-02T23:59:00.000Z',
        location: 'Little Rock, North Little Rock, Sherwood, Jacksonville, AR',
        lat: 34.76,
        lng: -92.28,
        description:
            'Post-tornado utility damage and organic debris (130,000+ cubic yards in Little Rock alone) affecting transportation and ' +
            'restoration timelines. Entergy reported widespread outages across the tornado corridor. City deployed 115 debris ' +
            'workers by April 1; major routes cleared by afternoon of April 1.',
        instructions: [
            'Coordinate debris clearance with city public works (115 workers deployed April 1).',
            'Track hospital surge capacity — 54 tornado-related injuries reported regionally.',
        ],
        properties: {
            hazardous: {
                hazardType: 'Infrastructure',
                debrisCubicYards: 130_000,
                debrisWorkersDeployed: 115,
                utilityProvider: 'Entergy Arkansas',
            },
        },
    },
    {
        id: 'demo-lrk-insurance-aftermath-2023-04-01',
        externalId: 'demo-lrk-insurance-aftermath-2023-04-01',
        name: 'Regional Insurance & Recovery Brief — Day 2 Aftermath',
        category: 'hazardous' as const,
        source: 'manual' as const,
        severity: 'Moderate' as const,
        type: 'Statement' as const,
        status: 'Monitor' as const,
        iconType: 'cloud' as const,
        issuedAt: '2023-04-01T14:00:00.000Z',
        expiresAt: '2023-04-15T23:59:00.000Z',
        location: 'Central Arkansas — Pulaski and Lonoke counties',
        lat: 34.75,
        lng: -92.32,
        description:
            'Arkansas Insurance Department preliminary estimates placed regional insurance payouts above $489 million by end of 2023, ' +
            'including same-day severe weather across the state. NWS final survey confirmed EF-3 rating with $90M+ direct property ' +
            'damage from this tornado alone. FEMA and state VOAD partners activated long-term recovery planning.',
        instructions: [
            'Establish disaster recovery center locations for affected residents.',
            'Track unmet needs in apartment complexes (Calais Forest, Turtle Creek) with displaced tenants.',
        ],
        properties: {
            hazardous: {
                hazardType: 'Recovery',
                propertyDamageUsd: 90_000_000,
                insurancePayoutsUsd: 489_000_000,
            },
        },
    },
] as const;

/** Path segments for AI Risk narratives and incident detail grouping. */
export const DEMO_PATH_SEGMENTS = [
    {
        id: 'martindale-touchdown',
        label: 'Martindale Touchdown',
        timeCdt: '2:18 PM CDT',
        efRating: 2,
        summary: 'Tornado touched down in Martindale in western Little Rock; initial damage EF-0 to EF-2 before intensification.',
    },
    {
        id: 'chenal-breckenridge',
        label: 'Chenal Valley / Breckenridge (EF-3 Peak)',
        timeCdt: '2:25–2:35 PM CDT',
        efRating: 3,
        summary:
            'Peak EF-3 winds (165 mph) through Breckenridge and Chenal Parkway; Calais Forest and Turtle Creek apartments heavily damaged.',
    },
    {
        id: 'cammack-nlr-airport',
        label: 'Cammack Village → NLR Airport',
        timeCdt: '2:28–2:38 PM CDT',
        efRating: 3,
        summary:
            'Tornado emergency as circulation passed Cammack Village toward NWS office at North Little Rock Municipal Airport.',
    },
    {
        id: 'walnut-amboy',
        label: 'Walnut Valley / Amboy',
        timeCdt: '2:38–2:45 PM CDT',
        efRating: 3,
        summary: 'Eastern metro residential damage in Walnut Valley and Amboy; widespread home destruction.',
    },
    {
        id: 'sherwood-jacksonville',
        label: 'Sherwood → Jacksonville → Parnell',
        timeCdt: '2:42–2:58 PM CDT',
        efRating: 2,
        summary:
            'Continued eastward track through Sherwood and Jacksonville (Lonoke County) before dissipation near Parnell; 600 yd max width.',
    },
] as const;

/** Demo map markers — citizens along tornado corridor (presentation only). */
export const DEMO_CITIZEN_MARKERS = [
    { id: 'demo-cit-1', lat: 34.752, lng: -92.42, title: 'Chenal Valley resident', isSafe: false, location: 'Chenal Valley, Little Rock, AR' },
    { id: 'demo-cit-2', lat: 34.768, lng: -92.39, title: 'Breckenridge resident', isSafe: true, location: 'Breckenridge, Little Rock, AR' },
    { id: 'demo-cit-3', lat: 34.785, lng: -92.27, title: 'Amboy resident', isSafe: false, location: 'Amboy, North Little Rock, AR' },
    { id: 'demo-cit-4', lat: 34.812, lng: -92.22, title: 'Sherwood resident', isSafe: true, location: 'Sherwood, AR' },
    { id: 'demo-cit-5', lat: 34.858, lng: -92.14, title: 'Jacksonville resident', isSafe: false, location: 'Jacksonville, AR' },
] as const;

export const DEMO_RESPONDER_MARKERS = [
    { id: 'demo-res-1', lat: 34.74, lng: -92.33, title: 'LRFD Station 9 area', status: 'deployed', location: 'Little Rock Fire — Breckenridge corridor' },
    { id: 'demo-res-2', lat: 34.79, lng: -92.26, title: 'Amboy EMS staging', status: 'active', location: 'North Little Rock, AR' },
    { id: 'demo-res-3', lat: 34.865, lng: -92.12, title: 'Jacksonville SAR', status: 'active', location: 'Jacksonville, AR' },
] as const;

/** Historical narrative for AI Risk "Learn more" (no OpenAI required in demo). */
export const DEMO_HISTORICAL_ANALYSIS = {
    matched_event: 'March 31, 2023 Little Rock EF-3 Tornado (NWS LZK Survey)',
    match_confidence: 0.97,
    similarity_summary:
        'Live demo scenario mirrors the confirmed EF-3 track through Pulaski and Lonoke counties with comparable urban exposure and hospital surge patterns documented by NWS and Arkansas DEM. ' +
        'Timeline includes SPC High Risk outlook, Garland funnel report (1:18 PM CDT), Pulaski Tornado Warning (2:03 PM CDT), Martindale touchdown (2:18 PM CDT), ' +
        'Cammack Village and Sherwood/Jacksonville tornado emergencies, and mass-casualty activation.',
    past_damages: [
        '2,648 structures damaged or destroyed; $90M+ property damage (NWS survey).',
        '588 major damage/destroyed structures in Breckenridge/Chenal segment alone.',
        '>$489M regional insurance payouts by end of 2023 including same-day severe weather.',
        'Major apartment complex damage (Calais Forest, Turtle Creek) and commercial losses along Chenal Parkway.',
        '130,000+ cubic yards of debris in Little Rock; 115 city workers deployed April 1 for clearance.',
    ],
    past_procedures: [
        'Mass casualty event declared; hospitals reported surge of trauma cases (54 direct injuries; initial estimate ~600).',
        'NWS Little Rock staff took shelter; warning responsibility transferred to NWS Memphis during office take-cover.',
        'City of Little Rock deployed 115 workers for debris clearance by April 1; major routes cleared same afternoon.',
        'North Little Rock emergency curfew enacted overnight to support SAR and utility restoration.',
        'Entergy Arkansas coordinated widespread power restoration across tornado corridor.',
    ],
    current_procedures: [
        'Activate jurisdictional EOC and push Ready2Go alerts to sub-admin license area (full Arkansas in demo).',
        'Deploy responders to staging points along I-430, I-40, and US-67 corridors.',
        'Issue situational risk report and email PDF brief to Arkansas sub-admins and responders.',
        'Open Virtual EOC medical branch; track bed capacity at Baptist, UAMS, and CHI St. Vincent.',
    ],
    future_measures: [
        'Expand redundant warning channels for deaf/hard-of-hearing communities (post-event ADA training).',
        'Pre-identify shelter sites in Walnut Valley and Breckenridge high-density zones.',
        'Harden NWS-adjacent facilities and backup warning dissemination paths for office take-cover events.',
    ],
} as const;
