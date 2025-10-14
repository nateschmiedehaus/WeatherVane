{
  "snippets": [
    {
      "codeTitle": "Get Started with the Marketing API",
      "codeDescription": "Guides and resources for getting started with the Marketing API, including basic ad creation, campaign management, and ad optimization.",
      "codeLanguage": "APIDOC",
      "codeTokens": 147,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/s.md#_snippet_1",
      "pageTitle": "Meta Marketing API Documentation",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Get Started\n\n**Basic Ad Creation**\nGet detailed guidance on how to set up campaigns, ad sets, and ad creatives, including code samples that illustrate the implementation process. **> Learn More**\n\n**Manage Campaigns**\nLearn key operations you can perform using the Marketing API, including how to modify, pause and delete campaigns. **> Learn More**\n\n**Ad Optimization Basics**\nUse Marketing API endpoints that serve as essential tools for developers to manage audiences and analyze ad campaign insights. **> Learn More**"
        }
      ],
      "relevance": 0.032795697,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Guide: Install Apps and Generate Tokens",
      "codeDescription": "A step-by-step guide on how to install applications and generate access tokens using your system user credentials.",
      "codeLanguage": "APIDOC",
      "codeTokens": 336,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/system-users.md#_snippet_2",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Install Apps and Generate Tokens\n\n### Description\nThis guide provides instructions on how to install applications and generate access tokens for your system user. These tokens are necessary for making authenticated API calls.\n\n### Method\nPOST\n\n### Endpoint\n`/v18.0/oauth/access_token` (Example for token generation)\n\n### Parameters\n#### Query Parameters\n- **client_id** (string) - Required - Your app's Client ID.\n- **client_secret** (string) - Required - Your app's Client Secret.\n- **grant_type** (string) - Required - Set to 'client_credentials'.\n- **system_user_id** (string) - Required - The ID of the system user.\n\n### Request Example\n```\nPOST https://graph.facebook.com/v18.0/oauth/access_token?client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=client_credentials&system_user_id=YOUR_SYSTEM_USER_ID\n```\n\n### Response\n#### Success Response (200)\n- **access_token** (string) - The generated access token.\n- **token_type** (string) - The type of token (e.g., 'bearer').\n- **expires_in** (integer) - The expiration time of the token in seconds.\n\n#### Response Example\n```json\n{\n  \"access_token\": \"EAAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\",\n  \"token_type\": \"bearer\",\n  \"expires_in\": 3600\n}\n```"
        }
      ],
      "relevance": 0.032051284,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Instagram Ads API - Get Started",
      "codeDescription": "A five-step guide to help you start running ads on Instagram using the API.",
      "codeLanguage": "APIDOC",
      "codeTokens": 92,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/guides/instagramads.md#_snippet_1",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Get Started\n\n### Description\nFive steps to get you running ads on Instagram.\n\n### Method\nN/A (Informational)\n\n### Endpoint\nN/A (Informational)\n\n### Parameters\nN/A\n\n### Request Example\nN/A\n\n### Response\nN/A"
        }
      ],
      "relevance": 0.03201844,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Started with Marketing API",
      "codeDescription": "Guides on basic ad creation, campaign management, and ad optimization using the Marketing API. Includes code samples and key operations.",
      "codeLanguage": "APIDOC",
      "codeTokens": 213,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/adset/budget-limits.md#_snippet_1",
      "pageTitle": "Meta Marketing API Documentation",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Get Started with Marketing API\n\n### Description\nThis section provides guidance on setting up campaigns, ad sets, and ad creatives, managing campaigns (modify, pause, delete), and using endpoints for audience management and ad campaign insights.\n\n### Method\nN/A (Guides)\n\n### Endpoint\nN/A (Guides)\n\n### Parameters\nN/A (Guides)\n\n### Request Example\nN/A (Guides)\n\n### Response\nN/A (Guides)\n\n### Resources\n- **Basic Ad Creation**: Learn how to set up campaigns, ad sets, and ad creatives with code samples. [Learn More]\n- **Manage Campaigns**: Learn key operations like modifying, pausing, and deleting campaigns. [Learn More]\n- **Ad Optimization Basics**: Use endpoints for audience management and analyzing ad campaign insights. [Learn More]"
        }
      ],
      "relevance": 0.031498015,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Real Estate Ads - Get Started",
      "codeDescription": "Provides a step-by-step guide on how to begin using the Real Estate Ads API.",
      "codeLanguage": "APIDOC",
      "codeTokens": 144,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/dynamic-ads-for-real-estate.md#_snippet_0",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Get Started\n\n### Description\nA list of steps on how to get started with real estate ads.\n\n### Method\nGET\n\n### Endpoint\n/websites/developers_facebook_marketing-api/real_estate_ads/get_started\n\n### Parameters\nNone\n\n### Request Example\nNone\n\n### Response\n#### Success Response (200)\n- **documentation_content** (string) - The content of the 'Get Started' guide.\n\n#### Response Example\n{\n  \"documentation_content\": \"Steps to get started with Real Estate Ads...\"\n}"
        }
      ],
      "relevance": 0.031280547,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Conversions API - Get Started",
      "codeDescription": "This section outlines the process of implementing the Conversions API and details the prerequisites for integration. It also provides guidance for third-party partners.",
      "codeLanguage": "APIDOC",
      "codeTokens": 229,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/conversions-api/get-started.md#_snippet_0",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Get Started\n\n### Description\nThis page describes the process of implementing the Conversions API and details implementation prerequisites. If you are a third-party partner offering Conversions API functionalities for advertisers, there are different requirements to get started.\n\nIf your business has a firewall for outbound requests, see Crawler IPs and User Agents to get Facebook's IP addresses. Be aware that the list of addresses changes often.\n\nWeb, app, and physical store events shared using the Conversions API require specific parameters. The list of required parameters is available here.\n\n## Process Overview\n\nThe process of setting up a Conversions API integration consists of the following high-level steps:\n\n1. Choosing the integration method that is right for you.\n2. Completing the necessary prerequisites for that implementation method.\n3. Implementing using that integration method.\n4. Verifying your setup and adhering to best practices that help improve ad performance."
        }
      ],
      "relevance": 0.028441634,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Create App Install Campaign using Python SDK",
      "codeDescription": "This Python example demonstrates creating an app install campaign with the Facebook Business SDK. It requires API initialization with an access token and includes parameters for the campaign name, objective, and status.",
      "codeLanguage": "python",
      "codeTokens": 191,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/mobile-app-ads.md#_snippet_56",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "python",
          "code": "from facebook_business.adobjects.adaccount import AdAccount\nfrom facebook_business.adobjects.campaign import Campaign\nfrom facebook_business.api import FacebookAdsApi\n\naccess_token = '<ACCESS_TOKEN>'\napp_secret = '<APP_SECRET>'\napp_id = '<APP_ID>'\nid = '<AD_ACCOUNT_ID>'\nFacebookAdsApi.init(access_token=access_token)\n\nfields = [\n]\nparams = {\n  'name': 'App Installs Campaign with Dynamic Product Ads',\n  'objective': 'OUTCOME_APP_PROMOTION',\n  'status': 'PAUSED',\n  'special_ad_categories': [],\n}\nprint AdAccount(id).create_campaign(\n  fields=fields,\n  params=params,\n)\n"
        }
      ],
      "relevance": 0.027863778,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "App Event Payload Example",
      "codeDescription": "This example demonstrates the structure of an Install event payload for the Conversions API, showcasing various parameters for app data and user information.",
      "codeLanguage": "APIDOC",
      "codeTokens": 697,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/conversions-api/app-events.md#_snippet_14",
      "pageTitle": "Conversions API for App Events - Meta Marketing API",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## POST /websites/developers_facebook_marketing-api/app_events\n\n### Description\nThis endpoint allows you to send app events, such as installs, to the Facebook Marketing API.\n\n### Method\nPOST\n\n### Endpoint\n`/websites/developers_facebook_marketing-api/app_events`\n\n### Parameters\n#### Request Body\n- **data** (array) - Required - An array of event objects.\n  - **event_name** (string) - Required - The name of the event (e.g., \"MobileAppInstall\").\n  - **event_time** (integer) - Required - The timestamp of the event in Unix time.\n  - **action_source** (string) - Required - The source of the action (e.g., \"app\").\n  - **user_data** (object) - Required - Information about the user.\n    - **client_ip_address** (string) - Optional - The client's IP address.\n    - **madid** (string) - Optional - The Mobile Advertiser ID.\n    - **anon_id** (string) - Optional - An anonymous ID.\n  - **app_data** (object) - Optional - Information about the app.\n    - **advertiser_tracking_enabled** (integer) - Optional - Indicates if advertiser tracking is enabled (1 for enabled, 0 for disabled).\n    - **application_tracking_enabled** (integer) - Optional - Indicates if application tracking is enabled (1 for enabled, 0 for disabled).\n    - **extinfo** (array) - Optional - Extended information about the app and device.\n\n### Request Example\n```json\n{\n  \"data\": [\n    {\n      \"event_name\": \"MobileAppInstall\",\n      \"event_time\": 1684389252,\n      \"action_source\": \"app\",\n      \"user_data\": {\n        \"client_ip_address\": \"2001:0db8:85a3:0000:0000:8a2e:0370:7334\",\n        \"madid\": \"38400000-8cf0-11bd-b23e-10b96e40000d\",\n        \"anon_id\": \"12345340-1234-3456-1234-123456789012\"\n      },\n      \"app_data\": {\n        \"advertiser_tracking_enabled\": 1,\n        \"application_tracking_enabled\": 1,\n        \"extinfo\": [\n          \"a2\",\n          \"com.some.app\",\n          \"771\",\n          \"Version 7.7.1\",\n          \"10.1.1\",\n          \"OnePlus6\",\n          \"en_US\",\n          \"GMT-1\",\n          \"TMobile\",\n          \"1920\",\n          \"1080\",\n          \"2.00\",\n          \"2\",\n          \"128\",\n          \"8\",\n          \"USA/New York\"\n        ]\n      }\n    }\n  ]\n}\n```\n\n### Response\n#### Success Response (200)\n- **status** (string) - Indicates the success status of the request.\n- **message** (string) - A confirmation message.\n\n#### Response Example\n```json\n{\n  \"status\": \"success\",\n  \"message\": \"Event received successfully.\"\n}\n```"
        }
      ],
      "relevance": 0.02229225,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Create Ad Set with Daily Budget (Java SDK)",
      "codeDescription": "This example demonstrates how to create a new Ad Set using the Java SDK, specifying a daily budget, start and end times, campaign ID, bid amount, optimization goal, targeting, and status.",
      "codeLanguage": "APIDOC",
      "codeTokens": 736,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/bidding/overview/budgets.md#_snippet_8",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## POST /act_{ad_account_id}/adsets\n\n### Description\nCreates a new Ad Set for a given Ad Account.\n\n### Method\nPOST\n\n### Endpoint\n`/act_{ad_account_id}/adsets`\n\n### Parameters\n#### Path Parameters\n- **ad_account_id** (string) - Required - The ID of the Ad Account.\n\n#### Query Parameters\n- **access_token** (string) - Required - Your Facebook API access token.\n\n#### Request Body\n- **name** (string) - Required - The name of the Ad Set.\n- **daily_budget** (integer) - Optional - The daily budget for the Ad Set in cents.\n- **start_time** (datetime) - Required - The start time for the Ad Set in ISO 8601 format.\n- **end_time** (datetime) - Required - The end time for the Ad Set in ISO 8601 format.\n- **campaign_id** (string) - Required - The ID of the Campaign the Ad Set belongs to.\n- **bid_amount** (integer) - Optional - The bid amount for the Ad Set in cents.\n- **billing_event** (enum) - Required - The billing event for the Ad Set (e.g., `LINK_CLICKS`).\n- **optimization_goal** (enum) - Required - The optimization goal for the Ad Set (e.g., `LINK_CLICKS`).\n- **targeting** (object) - Required - Targeting specifications for the Ad Set.\n  - **facebook_positions** (array of strings) - Optional - Specifies Facebook placements (e.g., `[\"feed\"]`).\n  - **geo_locations** (object) - Optional - Geographic targeting settings.\n    - **countries** (array of strings) - Optional - Array of country codes (e.g., `[\"US\"]`).\n- **status** (enum) - Optional - The status of the Ad Set (e.g., `PAUSED`).\n\n### Request Example\n```java\nnew AdAccount(id, context).createAdSet()\n  .setName(\"My First Adset\")\n  .setDailyBudget(2000L)\n  .setStartTime(\"2024-07-29T17:54:47-0700\")\n  .setEndTime(\"2024-08-05T17:54:47-0700\")\n  .setCampaignId(\"<adCampaignLinkClicksID>\")\n  .setBidAmount(100L)\n  .setBillingEvent(AdSet.EnumBillingEvent.VALUE_LINK_CLICKS)\n  .setOptimizationGoal(AdSet.EnumOptimizationGoal.VALUE_LINK_CLICKS)\n  .setTargeting(\n      new Targeting()\n        .setFieldFacebookPositions(Arrays.asList(\"feed\"))\n        .setFieldGeoLocations(\n          new TargetingGeoLocation()\n            .setFieldCountries(Arrays.asList(\"US\"))\n        )\n    )\n  .setStatus(AdSet.EnumStatus.VALUE_PAUSED)\n  .execute();\n```\n\n### Response\n#### Success Response (200)\n- **id** (string) - The unique identifier of the created Ad Set.\n- **name** (string) - The name of the Ad Set.\n\n#### Response Example\n```json\n{\n  \"id\": \"<AD_SET_ID>\",\n  \"name\": \"My First Adset\"\n}\n```"
        }
      ],
      "relevance": 0.020820513,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Android App Tracking Setup Example",
      "codeDescription": "Illustrates how to configure app tracking parameters for Android devices. It covers enabling advertiser and application tracking, and constructing the `extinfo` array with device-specific details as required for Android.",
      "codeLanguage": "kotlin",
      "codeTokens": 164,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/conversions-api/app-events.md#_snippet_4",
      "pageTitle": "Conversions API for App Events - Meta Marketing API",
      "codeList": [
        {
          "language": "kotlin",
          "code": "val parameters = mapOf(\n    \"advertiser_tracking_enabled\" to 1, // or 0\n    \"application_tracking_enabled\" to 1, // or 0\n    \"extinfo\" to \"a2,com.example.androidapp,1.0,1.0-beta,11,Pixel 5,en-US,CST,T-Mobile,1080,2340,4,128,50,America/Chicago\"\n)\n// These parameters should be included when sending app events through the Facebook SDK or API."
        }
      ],
      "relevance": 0.020562772,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Example JSON Response for Format Transformation",
      "codeDescription": "This is an example JSON response when requesting the `format_transformation_spec` for an ad creative. It details the `data_source` and `format` that were applied.",
      "codeLanguage": "json",
      "codeTokens": 99,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/creative/format-automation.md#_snippet_2",
      "pageTitle": "Get Started with Format Automation - Facebook Marketing API",
      "codeList": [
        {
          "language": "json",
          "code": "{\n  {\n    \"format_transformation_spec\": [\n    {\n      \"data_source\": [\"catalog\"]\n      \"format\": \"da_collection\"\n    }]\n  },\n  \"id\": <AD_CREATIVE_ID>\n}"
        }
      ],
      "relevance": 0.015873017,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Integration as a Platform - Step 1: Set Up Requirements",
      "codeDescription": "Details the requirements for partners offering the Conversions API as a service, including necessary access levels, features, and permissions.",
      "codeLanguage": "APIDOC",
      "codeTokens": 158,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/conversions-api/guides/end-to-end-implementation.md#_snippet_9",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Integration as a Platform: Step 1: Set Up Requirements\n\n### Description\nThis section outlines the prerequisites for partners intending to integrate and offer the Conversions API as a service to advertisers. It specifies the required access levels, features, and permissions for the partner's application.\n\n### Requirements:\n*   **Access Level**: Advanced Access\n*   **Feature**: Ads Management Standard Access\n*   **Permissions**: `ads_management` or `business_management`, in addition to `pages_read_engagement` and `ads_read`."
        }
      ],
      "relevance": 0.015384615,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Read Business User - Android SDK",
      "codeDescription": "Shows how to get business user information via the Facebook Android SDK. This example uses `GraphRequest` for asynchronous API calls and requires proper setup of the Facebook SDK for Android.",
      "codeLanguage": "Java",
      "codeTokens": 115,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/reference/business-user.md#_snippet_3",
      "pageTitle": "Facebook Marketing API - Business User",
      "codeList": [
        {
          "language": "java",
          "code": "/* make the API call */\nnew GraphRequest(\n    AccessToken.getCurrentAccessToken(),\n    \"/{business-user-id}\",\n    null,\n    HttpMethod.GET,\n    new GraphRequest.Callback() {\n        public void onCompleted(GraphResponse response) {\n            /* handle the result */\n        }\n    }\n).executeAsync();"
        }
      ],
      "relevance": 0.015151516,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Started with Marketing API",
      "codeDescription": "Provides detailed guidance on setting up campaigns, ad sets, and ad creatives, including code samples for implementation. Also covers key operations like modifying, pausing, and deleting campaigns, and using API endpoints for audience management and ad campaign insights.",
      "codeLanguage": "APIDOC",
      "codeTokens": 171,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/index.md#_snippet_1",
      "pageTitle": "Meta Marketing API Documentation",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Get Started\n\n### Basic Ad Creation\nGet detailed guidance on how to set up campaigns, ad sets, and ad creatives, including code samples that illustrate the implementation process. **> Learn More**\n\n### Manage Campaigns\nLearn key operations you can perform using the Marketing API, including how to modify, pause and delete campaigns. **> Learn More**\n\n### Ad Optimization Basics\nUse Marketing API endpoints that serve as essential tools for developers to manage audiences and analyze ad campaign insights. **> Learn More**"
        }
      ],
      "relevance": 0.014925373,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Preview for Background Generation",
      "codeDescription": "Get a preview of an ad that has been opted into background generation.",
      "codeLanguage": "APIDOC",
      "codeTokens": 372,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/creative/generative-ai-features.md#_snippet_21",
      "pageTitle": "Get Started with Generative AI Features on Facebook Marketing API",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## GET /<AD_ID>/previews (for Background Generation)\n\n### Description\nRetrieves a preview for an ad that has been opted into the background generation feature. This preview shows the generated backgrounds based on the original asset.\n\n### Method\nGET\n\n### Endpoint\n`https://graph.facebook.com/v19.0/<AD_ID>/previews`\n\n### Query Parameters\n- **ad_format** (string) - Required - The ad format, must be `MOBILE_FEED_STANDARD` for background generation previews.\n- **creative_feature** (string) - Required - Set to `image_background_gen` to preview background generation.\n- **access_token** (string) - Required - Your Facebook API access token.\n\n### Response\n#### Success Response (200)\n- **data** (array) - Contains preview information.\n  - **body** (string) - HTML iframe code for the preview.\n  - **transformation_spec** (object) - Details about the background generation transformation.\n    - **image_background_gen** (array)\n      - **body** (string) - HTML iframe code for the transformed preview.\n      - **status** (string) - Eligibility status (eligible, pending, ineligible).\n\n### Response Example\n```json\n{\n  \"data\": [\n    {\n      \"body\": \"<iframe src='<PREVIEW_URL>'></iframe>\",\n      \"transformation_spec\": {\n        \"image_background_gen\": [\n          {\n            \"body\": \"<iframe src='<PREVIEW_URL>'></iframe>\",\n            \"status\": \"eligible\" // or one of \"pending\", \"ineligible\"\n          }\n        ]\n      }\n    }\n  ]\n}\n```"
        }
      ],
      "relevance": 0.014925373,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Ad Previews",
      "codeDescription": "Retrieve previews for ads with specified formats and creative features.",
      "codeLanguage": "APIDOC",
      "codeTokens": 370,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/creative/generative-ai-features.md#_snippet_17",
      "pageTitle": "Get Started with Generative AI Features on Facebook Marketing API",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## GET /<AD_ID>/previews\n\n### Description\nRetrieves previews for a given ad, supporting different ad formats and creative features.\n\n### Method\nGET\n\n### Endpoint\n`https://graph.facebook.com/v19.0/<AD_ID>/previews`\n\n### Query Parameters\n- **ad_format** (string) - Required - The format of the ad (e.g., INSTAGRAM_STANDARD, FACEBOOK_REELS_MOBILE).\n- **creative_feature** (string) - Required - The creative feature to apply (e.g., image_uncrop, image_background_gen).\n- **access_token** (string) - Required - Your Facebook API access token.\n\n### Response\n#### Success Response (200)\n- **data** (array) - Contains preview information.\n  - **body** (string) - HTML iframe code for the preview.\n  - **transformation_spec** (object) - Details about the applied transformations.\n    - **image_uncrop** (array) - For image uncrop feature.\n    - **image_background_gen** (array) - For background generation feature.\n      - **body** (string) - HTML iframe code for the transformed preview.\n      - **status** (string) - Eligibility status (eligible, pending, ineligible).\n\n### Response Example\n```json\n{\n  \"data\": [\n    {\n      \"body\": \"<iframe src='<PREVIEW_URL>'></iframe>\",\n      \"transformation_spec\": {\n        \"image_uncrop\": [\n          {\n            \"body\": \"<iframe src='<PREVIEW_URL>'></iframe>\",\n            \"status\": \"eligible\"\n          }\n        ]\n      }\n    }\n  ]\n}\n```"
        }
      ],
      "relevance": 0.014705882,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Fetch Products (PHP SDK)",
      "codeDescription": "Demonstrates how to initialize the PHP SDK and fetch all products from a catalog, iterating through them to display their name and ID.",
      "codeLanguage": "APIDOC",
      "codeTokens": 403,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/catalog/get-started/integrate-via-meta-sdk.md#_snippet_4",
      "pageTitle": "Catalog Integration Using Meta Business SDK",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Fetch Products\n\n### Description\nThis endpoint retrieves all products associated with a specific catalog using the PHP SDK. It allows for iterating through the products and accessing their details.\n\n### Method\nSDK-based operation (equivalent to a GET request).\n\n### Endpoint\nNot directly applicable, as this is an SDK operation.\n\n### Parameters\n#### Path Parameters\nNone.\n\n#### Query Parameters\nNone.\n\n#### Request Body\nNone.\n\n### Request Example\n```php\n<?php\nuse FacebookAds\\Api;\nuse Facebook\\BusinessSDK\\ProductCatalog;\nuse Facebook\\BusinessSDK\\ProductItemFields;\n\nApi::init($app_id, $app_secret, $access_token);\n\n$catalog = new ProductCatalog($catalog_id);\n$cursor = $catalog->getProducts();\n\nwhile ($cursor->valid()) {\n   echo $cursor->current()->{ProductItemFields::NAME} . PHP_EOL;\n   echo $cursor->current()->{ProductItemFields::ID} . PHP_EOL;\n   $cursor->next();\n}\n\n$cursor->end();\n$cursor->fetchAfter();\n$cursor->next();\n\nwhile ($cursor->valid()) {\n   echo $cursor->current()->{ProductItemFields::NAME} . PHP_EOL;\n   echo $cursor->current()->{ProductItemFields::ID} . PHP_EOL;\n   $cursor->next();\n}\n?>\n```\n\n### Response\n#### Success Response (200)\nReturns a cursor object that allows iteration over product items. Each item contains fields like name and ID.\n\n#### Response Example\n```json\n{\n  \"product_name_1\": \"Example Product 1\",\n  \"product_id_1\": \"12345\",\n  \"product_name_2\": \"Example Product 2\",\n  \"product_id_2\": \"67890\"\n}\n```"
        }
      ],
      "relevance": 0.014492754,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Preview Ad Creative for Background Generation",
      "codeDescription": "Get a preview of an ad creative opted into background generation without creating an ad.",
      "codeLanguage": "APIDOC",
      "codeTokens": 282,
      "codeId": "https://github.com/context7/developers_facebook_marketing-api/blob/main/creative/generative-ai-features.md#_snippet_22",
      "pageTitle": "Get Started with Generative AI Features on Facebook Marketing API",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## GET /<AD_CREATIVE_ID>/previews (for Background Generation)\n\n### Description\nRetrieves a preview for an ad creative that has been opted into the background generation feature, without the need to create an ad first.\n\n### Method\nGET\n\n### Endpoint\n`https://graph.facebook.com/<AD_CREATIVE_ID>/previews`\n\n### Query Parameters\n- **creative_feature** (string) - Required - Set to `image_background_gen` to preview background generation.\n- **access_token** (string) - Required - Your Facebook API access token.\n\n### Response\n#### Success Response (200)\n- **data** (array) - Contains preview information.\n  - **body** (string) - HTML iframe code for the preview.\n  - **transformation_spec** (object) - Details about the background generation transformation.\n    - **image_background_gen** (array)\n      - **body** (string) - HTML iframe code for the transformed preview.\n      - **status** (string) - Eligibility status (eligible, pending, ineligible).\n\n### Response Example\n(Response structure is similar to the `/<AD_ID>/previews` endpoint for background generation, showing the generated preview iframe.)"
        }
      ],
      "relevance": 0.014492754,
      "model": "gemini-2.5-flash-lite"
    }
  ],
  "metadata": {
    "authentication": "personal"
  }
}