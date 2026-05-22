context:
- All data came from db model name  @file:UnifiedEvent.ts 
-  We will always shows the only that past data which is came in crrent acttive event. like if there is earthquake in current then we shoows it in the report and also fetch the past data from it. In casee we didn't receivve any event foor flood then we don't show any info about flood event we don't show in bar chart (incident distribution) nor in historical context. so these all are dynamic.

Features for AI risk asssessment:
Overall Threat Level:
- this overall threat level is the average from all the current events 'severity'. whatevver the current data we receive for all the categories we take the avaerage of severity and then shows it here.
Active Incidents:
- The number of current active eventts we receive from realtime API. after showing active incidents we need to define the two variable Major and minor. it's your job to decide which eventt goes in Major and minor on the basis of  "severity".
AI Confidence: 
- leave this same right noow we will work on this later.
Population at Risk: 
- leave this same right noow we will work on this later.
Incident Distribution:
- This will be the dynamic field.
- whatever the events are active that receive from realtime api (current data), Each category wise eventt score shows in bar chart format like visible in image. 
Severity levels:
- this is also dynamic only shows those severties that are availabble in current data means active events severties.
- Under these 4 categories receiving from the db under "severity" field. So, 4 dynamic boxes will be created because we hae 4 fiedls.
- under each severity we shows summary of each hazardous event that generate from openai api by using properties and other relvant fields from db. 
- Eg: Severity level is high. We will fecth all categories from current data for severity level high then for each category like flood whatever the incidentts occurs for "flood" we will take their data from the event  including all properties and relevent fields that goes to openai API that generates the summary. now thi whole process repeat for each category we receve under high sverity level.
- we need to make sure all the key details, numbers, and statistics should be mentioned.
Historical Context & Mitigation Strategy:
- The data shows here is also dynamic basis on current data we recieve. there will be each separate tab for each category. We show only those categories data that are currenttly in active incidents. means if we didn't recive "flood" catagory we will not shows its tab or anything regarding it.
- following are the fields or data we need to shows under each category tab:
- Matched Event :  this is  the similar recent active event that is generate by AI using dtaa from db current API. we need t here completely and cleary define the evnt name, data, time, statistics,numbers and other details.
- Past Damages & Losses (What it cost last time): We are saving all data from apis in our db model. so you need to frist take the current event details and properties under properties you need to chose several fields like for earth uake you can choose "magnitude" then you will use that "magnitude" (for other catagories it will varies you need to analyse the data under properties you a find the fields that will help you extract similar incident ) to extract atleast three ssimilar events from past data available in db.  then you pass that to openai api to genrate summary. sumary must contain all evnt name, data, time, fatality, injury, and property damage (damageProperty/damageCrops) statistics,numbers, damages, losess and other details.
- Past Procedures (Mitigation steps taken then): We are saving all data from apis in our db model. so you need to frist take the current event details and properties under properties you need to choose several fields like for earthquake you can choose "magnitude" then you will use that "magnitude" (for other catagories it will varies you need to analyse the data under properties you a find the fields that will help you extract similar incident ) to extract atleast three similar events from past data available in db.  then you pass that to openai api to genrate summary. summary must contain all eevnt name, data, time, statistics,numbers, federal aid payouts/damage costs and other details regarding sstrategies & initiatives.
- Current Procedures (From live ingest for this category): the data you receive from live api for each category (for each other catagories it will varies you need to analyse the data under properties you a find the fields that will help you geerate better results).  then you pass that data to openai api to genrate summary. summary must contain all eevnt name, data, time, statistics,numbers, federal aid payouts/damage costs and other details.
- Future Preventative Measures (AI-recommended long-term plan): On the behalf of past Procedures & Current Procedures, we will generate the iniiative & strategies to overcome and resolve the issuues. we will mention measures as well here but the details mention here should be realistic and expert level npt general or basic. this report & summary will be show to high level experts to take neccesary measures so the strategies and initiatives suggest by you must be full professional and great.
- Strategic Recommendations (Prioritized action plan): 
here we use previously suggested "niiative & strategies to overcome and resolve the issuues under Future Preventative Measures" to generate proper detail action plan with suggested status : "urgent", "standard" and  "immediate" . Also  you need to generate proper step wise plan.

GUIDELINES:
- We need to show some data directly that are not generated byy AI so you don't need to wait for AI to generate summaries then shows all data once. youu need to take measures to redue latency.
- Under field "Historical Context & Mitigation Strategy', you will calling api separately for each category so AI don't hallucinate and mix up the data. take all necessary measures and strategies to reeduce loading time and latency.
- if you didn't find past data so you will not able to generate summary for "Past Damages & Losses" annd "Past Procedures". so yoou need to shows some suitable relevant message.
- In order to fetch data from api realtime, yo can choose to fetch all categories current data at single time or in chucks whatevr suitable and reduced latency.