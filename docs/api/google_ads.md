{
  "snippets": [
    {
      "codeTitle": "Ruby Client Library Setup",
      "codeDescription": "Instructions for installing and configuring the Ruby client library, including Gemfile setup and client instantiation.",
      "codeLanguage": "APIDOC",
      "codeTokens": 465,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/first-call/get-campaigns.md#_snippet_27",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Ruby Client Library Setup\n\n### Description\nThis section covers the installation and setup of the Google Ads API client library for Ruby, including dependency management and client initialization.\n\n### Installation\nAdd the `google-ads-googleads` gem to your Gemfile and install using bundler.\n\n```ruby\ngem 'google-ads-googleads', '~> 35.2.0'\n```\n\nThen run:\n\n```bash\nbundle install\n```\n\n### Configuration\n1. **Copy and Modify `google_ads_config.rb`**: \n   Copy the `google_ads_config.rb` file from the GitHub repository and update it with your credentials.\n   ```ruby\n   Google::Ads::GoogleAds::Config.new do |c|\n     c.developer_token = 'INSERT_DEVELOPER_TOKEN_HERE'\n     c.login_customer_id = 'INSERT_LOGIN_CUSTOMER_ID_HERE'\n     c.keyfile = 'JSON_KEY_FILE_PATH'\n   end\n   ```\n\n### Client Instantiation\nCreate a `GoogleAdsClient` instance by providing the path to your configuration file.\n\n```ruby\nrequire 'google/ads/googleads'\n\n# Creates a client by passing the path to the config file.\nclient = Google::Ads::GoogleAds::GoogleAdsClient.new('path/to/google_ads_config.rb')\n```\n\n### Example Usage (Run Campaign Report)\nThis example demonstrates fetching campaign data using the `GoogleAdsService.SearchStream` method.\n\n```ruby\nrequire 'google/ads/googleads'\n\ndef get_campaigns(customer_id)\n  # GoogleAdsClient will read a config file from\n  # ENV['HOME']/google_ads_config.rb when called without parameters\n  client = Google::Ads::GoogleAds::GoogleAdsClient.new\n\n  responses = client.service.google_ads.search_stream(\n    customer_id: customer_id,\n    query: \"SELECT campaign.id, campaign.name FROM campaign ORDER BY campaign.id\"\n  )\n\n  responses.each do |response|\n    response.results.each do |row|\n      puts \"Campaign with ID #{row.campaign.id} and name '#{row.campaign.name}' was found.\"\n    end\n  end\nend\n```"
        }
      ],
      "relevance": 0.031280547,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Ruby Client Library Setup and Usage",
      "codeDescription": "Instructions for installing and configuring the Ruby client library, including credential management and a campaign retrieval example.",
      "codeLanguage": "APIDOC",
      "codeTokens": 428,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/first-call/refresh-token.md#_snippet_20",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Ruby Client Library Setup and Usage\n\n### Description\nThis section provides guidance on setting up the Google Ads Ruby client library, covering installation, credential configuration, and an example for retrieving campaigns.\n\n### 1. Install the Gem\n\nAdd the gem to your `Gemfile` and run `bundle install`:\n\n```ruby\ngem 'google-ads-googleads', '~> 35.2.0'\n```\n\nThen run:\n\n```bash\nbundle install\n```\n\n### 2. Configure Credentials\n\nCopy the `google_ads_config.rb` file and update it with your credentials:\n\n```ruby\nGoogle::Ads::GoogleAds::Config.new do |c|\n  c.developer_token = 'INSERT_DEVELOPER_TOKEN_HERE'\n  c.login_customer_id = 'INSERT_LOGIN_CUSTOMER_ID_HERE'\n  c.keyfile = 'JSON_KEY_FILE_PATH'\nend\n```\n\n### 3. Create GoogleAdsClient Instance\n\nInstantiate the `GoogleAdsClient` by passing the path to your configuration file:\n\n```ruby\nclient = Google::Ads::GoogleAds::GoogleAdsClient.new('path/to/google_ads_config.rb')\n```\n\n### 4. Retrieve Campaigns\n\nUse the `GoogleAdsService.SearchStream` method to fetch campaign data:\n\n```ruby\ndef get_campaigns(customer_id)\n  # GoogleAdsClient will read a config file from\n  # ENV['HOME']/google_ads_config.rb when called without parameters\n  client = Google::Ads::GoogleAds::GoogleAdsClient.new\n\n  responses = client.service.google_ads.search_stream(\n    customer_id: customer_id,\n    query: \"SELECT campaign.id, campaign.name FROM campaign ORDER BY campaign.id\"\n  )\n\n  responses.each do |response|\n    response.results.each do |row|\n      puts \"Campaign with ID #{row.campaign.id} and name '#{row.campaign.name}' was found.\"\n    end\n  end\nend\n```\n"
        }
      ],
      "relevance": 0.030000001,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Ruby Client Library Setup and Campaign Retrieval",
      "codeDescription": "Instructions for installing the Ruby client library, configuring credentials, and retrieving campaigns using the GoogleAdsService.SearchStream method.",
      "codeLanguage": "APIDOC",
      "codeTokens": 402,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/get-started/make-first-call.md#_snippet_16",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Ruby Client Library\n\n### Description\nThis section outlines the process of installing the Google Ads API client library for Ruby using Bundler, configuring credentials, and an example of how to retrieve campaign data.\n\n### Installation\n\nAdd the gem to your Gemfile and run bundle install.\n\n```ruby\ngem 'google-ads-googleads', '~> 35.2.0'\n```\n\nThen run:\n\n```bash\nbundle install\n```\n\n### Configuration\n\n1.  **Copy Configuration File**: Make a copy of the `google_ads_config.rb` file from the GitHub repository.\n2.  **Modify Credentials**: Update the file with your credentials.\n\n```ruby\nGoogle::Ads::GoogleAds::Config.new do |c|\n  c.developer_token = 'INSERT_DEVELOPER_TOKEN_HERE'\n  c.login_customer_id = 'INSERT_LOGIN_CUSTOMER_ID_HERE'\n  c.keyfile = 'JSON_KEY_FILE_PATH'\nend\n```\n\n### Client Instantiation\n\nCreate a `GoogleAdsClient` instance by passing the path to your configuration file.\n\n```ruby\nclient = Google::Ads::GoogleAds::GoogleAdsClient.new('path/to/google_ads_config.rb')\n```\n\n### Retrieving Campaigns\n\nUse the `GoogleAdsService.SearchStream` method to retrieve campaign data. The client can also read configuration from `ENV['HOME']/google_ads_config.rb` if no path is provided.\n\n```ruby\ndef get_campaigns(customer_id)\n  # GoogleAdsClient will read a config file from\n  # ENV['HOME']/google_ads_config.rb when called without parameters\n  client = Google::Ads::GoogleAds::GoogleAdsClient.new\n\n  responses = client.service.google_ads.search_stream(\n    customer_id: customer_id,\n  )\nend\n```"
        }
      ],
      "relevance": 0.029030912,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Python Client Library Setup and Usage",
      "codeDescription": "Instructions for installing and configuring the Python client library, including credential management and a campaign retrieval example.",
      "codeLanguage": "APIDOC",
      "codeTokens": 553,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/first-call/refresh-token.md#_snippet_19",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Python Client Library Setup and Usage\n\n### Description\nThis section covers the installation, credential setup, and usage of the Google Ads Python client library, including an example for retrieving campaigns.\n\n### 1. Install the Client Library\n\nInstall the library using pip:\n\n```bash\npython -m pip install google-ads==21.3.0\n```\n\n### 2. Configure Credentials\n\nCopy the `google-ads.yaml` file and update it with your credentials:\n\n```yaml\ndeveloper_token: INSERT_DEVELOPER_TOKEN_HERE\nlogin_customer_id: INSERT_LOGIN_CUSTOMER_ID_HERE\njson_key_file_path: JSON_KEY_FILE_PATH_HERE\n```\n\n### 3. Create GoogleAdsClient Instance\n\nInstantiate the `GoogleAdsClient` by loading from your configuration file:\n\n```python\nfrom google.ads.googleads.client import GoogleAdsClient\n\nclient = GoogleAdsClient.load_from_storage(\"path/to/google-ads.yaml\")\n```\n\n### 4. Configure Logging (Optional)\n\nAdd a handler to the library's logger to direct logs to stdout:\n\n```python\nimport logging\nimport sys\n\nlogger = logging.getLogger('google.ads.googleads.client')\nlogger.addHandler(logging.StreamHandler(sys.stdout))\n```\n\n### 5. Retrieve Campaigns\n\nUse the `GoogleAdsService.SearchStream` method to fetch campaign data:\n\n```python\nfrom google.ads.googleads.client import GoogleAdsClient\nfrom google.ads.googleads.errors import GoogleAdsException\nfrom typing import Iterator, List\nfrom google.ads.googleads.services import GoogleAdsServiceClient\nfrom google.ads.googleads.batch_job_service import BatchJobService\nfrom google.ads.googleads.proto.resources.types import GoogleAdsRow\nfrom google.ads.googleads.proto.services.types import SearchGoogleAdsStreamResponse\n\ndef main(client: GoogleAdsClient, customer_id: str) -> None:\n    ga_service: GoogleAdsServiceClient = client.get_service(\"GoogleAdsService\")\n\n    query: str = \"\"\"\n        SELECT\n          campaign.id,\n          campaign.name\n        FROM campaign\n        ORDER BY campaign.name    \"\"\"\n\n    # Issues a search request using streaming.\n    stream: Iterator[SearchGoogleAdsStreamResponse] = ga_service.search_stream(\n        customer_id=customer_id, query=query\n    )\n\n    for batch in stream:\n        rows: List[GoogleAdsRow] = batch.results\n        for row in rows:\n            print(\n                f\"Campaign with ID {row.campaign.id} and name \"\n                f'\"{row.campaign.name}\" was found.'\n            )\n# get_campaigns.py\n```\n"
        }
      ],
      "relevance": 0.028893441,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Python Client Library Setup",
      "codeDescription": "Instructions for installing and configuring the Python client library, including credential management and client instantiation.",
      "codeLanguage": "APIDOC",
      "codeTokens": 529,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/first-call/get-campaigns.md#_snippet_26",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Python Client Library Setup\n\n### Description\nThis section guides you through installing and setting up the Google Ads API client library for Python, including credential management and client initialization.\n\n### Installation\nInstall the client library using pip:\n\n```bash\npython -m pip install google-ads==21.3.0\n```\n\n### Configuration\n1. **Copy and Modify `google-ads.yaml`**: \n   Copy the `google-ads.yaml` file from the GitHub repository and update it with your credentials.\n   ```yaml\n   developer_token: INSERT_DEVELOPER_TOKEN_HERE\n   login_customer_id: INSERT_LOGIN_CUSTOMER_ID_HERE\n   json_key_file_path: JSON_KEY_FILE_PATH_HERE\n   ```\n\n### Client Instantiation\nCreate a `GoogleAdsClient` instance by loading from your storage configuration.\n\n```python\nfrom google.ads.googleads.client import GoogleAdsClient\n\n# Constructs the GoogleAdsClient object.\nclient = GoogleAdsClient.load_from_storage(\"path/to/google-ads.yaml\")\n```\n\n### Logging Setup\nAdd a handler to the library's logger to direct output to the console.\n\n```python\nimport logging\nimport sys\n\nlogger = logging.getLogger('google.ads.googleads.client')\nlogger.addHandler(logging.StreamHandler(sys.stdout))\n```\n\n### Example Usage (Run Campaign Report)\nThis example shows how to fetch campaign data using the `GoogleAdsService.SearchStream` method.\n\n```python\nfrom google.ads.googleads.client import GoogleAdsClient\nfrom google.ads.googleads.services import GoogleAdsServiceClient\nfrom google.ads.googleads.types import SearchGoogleAdsStreamResponse, GoogleAdsRow\nfrom typing import Iterator, List\n\ndef main(client: GoogleAdsClient, customer_id: str) -> None:\n    ga_service: GoogleAdsServiceClient = client.get_service(\"GoogleAdsService\")\n\n    query: str = \"\"\"\n        SELECT\n          campaign.id,\n          campaign.name\n        FROM campaign\n        ORDER BY campaign.id\"\"\"\n\n    # Issues a search request using streaming.\n    stream: Iterator[SearchGoogleAdsStreamResponse] = ga_service.search_stream(\n        customer_id=customer_id, query=query\n    )\n\n    for batch in stream:\n        rows: List[GoogleAdsRow] = batch.results\n        for row in rows:\n            print(\n                f\"Campaign with ID {row.campaign.id} and name \"\n                f'\"{row.campaign.name}\" was found.'\n            )\n# get_campaigns.py\n```"
        }
      ],
      "relevance": 0.028381642,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Python Client Library Setup and Campaign Retrieval",
      "codeDescription": "Instructions for installing the Python client library, configuring credentials, and retrieving campaigns using the GoogleAdsService.SearchStream method.",
      "codeLanguage": "APIDOC",
      "codeTokens": 538,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/get-started/make-first-call.md#_snippet_15",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Python Client Library\n\n### Description\nThis section provides instructions for installing and configuring the Google Ads API client library for Python, along with an example for retrieving campaign data.\n\n### Installation\n\nInstall the client library using pip.\n\n```bash\npython -m pip install google-ads==21.3.0\n```\n\n### Configuration\n\n1.  **Copy Configuration File**: Make a copy of the `google-ads.yaml` file from the GitHub repository.\n2.  **Modify Credentials**: Update the copied file with your credentials.\n\n```yaml\ndeveloper_token: INSERT_DEVELOPER_TOKEN_HERE\nlogin_customer_id: INSERT_LOGIN_CUSTOMER_ID_HERE\njson_key_file_path: JSON_KEY_FILE_PATH_HERE\n```\n\n### Client Instantiation\n\nCreate a `GoogleAdsClient` instance by loading from your storage configuration.\n\n```python\nfrom google.ads.googleads.client import GoogleAdsClient\n\nclient = GoogleAdsClient.load_from_storage(\"path/to/google-ads.yaml\")\n```\n\n### Logging\n\nAdd a handler to the library's logger to direct output to the console.\n\n```python\nimport logging\nimport sys\n\nlogger = logging.getLogger('google.ads.googleads.client')\nlogger.addHandler(logging.StreamHandler(sys.stdout))\n```\n\n### Retrieving Campaigns\n\nUse the `GoogleAdsService.SearchStream` method to retrieve campaign data.\n\n```python\nfrom google.ads.googleads.client import GoogleAdsClient\nfrom google.ads.googleads.errors import GoogleAdsException\nfrom typing import Iterator, List\nfrom google.ads.googleads.v15.services.types import SearchGoogleAdsStreamResponse\nfrom google.ads.googleads.v15.resources.types import GoogleAdsRow\n\ndef main(client: GoogleAdsClient, customer_id: str) -> None:\n    ga_service: GoogleAdsServiceClient = client.get_service(\"GoogleAdsService\")\n\n    query: str = \"\"\"\n        SELECT\n          campaign.id,\n          campaign.name\n        FROM campaign\n        ORDER BY campaign.id\"\"\"\n\n    # Issues a search request using streaming.\n    stream: Iterator[SearchGoogleAdsStreamResponse] = ga_service.search_stream(\n        customer_id=customer_id, query=query\n    )\n\n    for batch in stream:\n        rows: List[GoogleAdsRow] = batch.results\n        for row in rows:\n            print(\n                f\"Campaign with ID {row.campaign.id} and name \"\n                f'\"{row.campaign.name}\" was found.'\n            )\n```\n\n*File: get_campaigns.py*"
        }
      ],
      "relevance": 0.028371628,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Getting Started Guide",
      "codeDescription": "Provides setup instructions for using the Google Ads API Client Library for Java.",
      "codeLanguage": "APIDOC",
      "codeTokens": 186,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/client-libs/java_hl=id.md#_snippet_5",
      "pageTitle": "Library Klien Google Ads API untuk Java",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Getting Started with the Google Ads API Client Library for Java\n\n### Description\nThis guide outlines the initial setup steps required to begin using the Google Ads API Client Library for Java.\n\n### Method\nSetup\n\n### Steps\n1. **Prerequisites**: Ensure you have Java 1.8 or later installed.\n2. **Dependency**: Add the Google Ads API client library for Java to your project's dependencies (e.g., via Maven or Gradle).\n3. **Configuration**: Configure your API access credentials (e.g., OAuth2 client ID and secret).\n4. **Client Instantiation**: Create an instance of the Google Ads API client service.\n\n### Further Reading\n- [Authorization Guide](#authorization)\n- [Build from source](#build-from-source)"
        }
      ],
      "relevance": 0.028169014,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Getting Started with Google Ads API .NET Client Library",
      "codeDescription": "This section covers the initial steps to set up and use the Google Ads API .NET client library, including installation, configuration, and basic usage.",
      "codeLanguage": "APIDOC",
      "codeTokens": 786,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/client-libs/dotnet/getting-started_hl=fa.md#_snippet_2",
      "pageTitle": "Google Ads API .NET Library Setup and Usage",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## Getting Started with Google Ads API .NET Client Library\n\nThis guide provides an overview of how to get started with the Google Ads API .NET client library.\n\n### Installation\n\nInstall the client library using NuGet:\n\n```bash\nInstall-Package Google.Ads.GoogleAds\n```\n\n### Setting Up Credentials\n\nYou need to configure your authentication credentials. This typically involves obtaining a developer token, client ID, client secret, and refresh token.\n\n**If you need to generate credentials:**\n\n1.  Follow the [Developer token guide](https://developers.google.com/google-ads/api/docs/first-call/dev-token) to get your developer token.\n2.  Follow the [OAuth desktop app flow guide](https://developers.google.com/google-ads/api/docs/authentication/oauth-desktop) to generate your client ID, client secret, and refresh token.\n\n**If you already have credentials:**\n\nCopy the `GoogleAdsApi` node and the `GoogleAdsApi` section under the `configSections` node from the example `App.config` file on GitHub into your `App.config` or `Web.config` file. These nodes are automatically imported if you used NuGet to install the package.\n\nPlace your developer token, client ID, client secret, and refresh token into your application's `App.config` / `Web.config` file.\n\nThe `App.config` file on GitHub is fully documented. Refer to the [configuration guide](https://github.com/googleads/googleads-dotnet-lib/blob/master/docs/configuration.md) for more information and alternative configuration methods like environment variables.\n\n### Making an API Call\n\nHere's how to create a `GoogleAdsClient` and make an API call:\n\n**1. Create a `GoogleAdsClient` instance:**\n\nThe `GoogleAdsClient` class is central to the Google Ads API .NET library. It allows you to create pre-configured service classes for making API calls. The default constructor creates a user object using settings from your `App.config` / `Web.config` file.\n\n```csharp\n// Create a Google Ads client using App.config settings.\nGoogleAdsClient client = new GoogleAdsClient();\n```\n\n**2. Create a Service:**\n\nUse the `GetService` method of the `GoogleAdsClient` to create a service instance. The `Services` class provides enumerations for all supported API versions and services.\n\n```csharp\n// Create the required service (e.g., CampaignService for V21).\nCampaignServiceClient campaignService = client.GetService(Services.V21.CampaignService);\n\n// Now you can make calls to the CampaignService.\n// For example:\n// var response = campaignService.SearchStream(...);\n```\n\n### Thread Safety\n\nIt is not safe to share a `GoogleAdsClient` instance across multiple threads. Configuration changes made in one thread might affect services created in other threads. However, operations like getting new service instances from a `GoogleAdsClient` and making calls to multiple services in parallel are generally safe.\n\n**Example of a multi-threaded application:**\n\n```csharp\n// Create separate GoogleAdsClient instances for each thread.\nGoogleAdsClient client1 = new GoogleAdsClient();\nGoogleAdsClient client2 = new GoogleAdsClient();\n\nThread userThread1 = new Thread(AddAdGroups);\nThread userThread2 = new Thread(AddAdGroups);\n\nuserThread1.Start(client1);\nuserThread2.Start(client2);\n\nuserThread1.Join();\nuserThread2.Join();\n\npublic void AddAdGroups(object data) {\n    GoogleAdsClient client = (GoogleAdsClient)data;\n    // Perform operations using the provided client instance.\n    // ...\n}\n```"
        }
      ],
      "relevance": 0.028158147,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "PHP Client Library Setup and Campaign Retrieval",
      "codeDescription": "Instructions for installing the PHP client library, configuring credentials, and retrieving campaigns using the GoogleAdsService.SearchStream method.",
      "codeLanguage": "APIDOC",
      "codeTokens": 627,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/get-started/make-first-call.md#_snippet_14",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## PHP Client Library\n\n### Description\nThis section details how to set up and use the Google Ads API client library for PHP. It covers credential configuration and an example of retrieving campaign data.\n\n### Installation\n\nThis guide doesn't cover installation details but assumes you have the library installed.\n\n### Configuration\n\n1.  **Copy Configuration File**: Make a copy of the `google_ads_php.ini` file from the GitHub repository.\n2.  **Modify Credentials**: Update the copied file with your actual credentials.\n\n```ini\n[GOOGLE_ADS]\ndeveloperToken = \"INSERT_DEVELOPER_TOKEN_HERE\"\nloginCustomerId = \"INSERT_LOGIN_CUSTOMER_ID_HERE\"\n\n[OAUTH2]\njsonKeyFilePath = \"INSERT_ABSOLUTE_PATH_TO_OAUTH2_JSON_KEY_FILE_HERE\"\nscopes = \"https://www.googleapis.com/auth/adwords\"\n```\n\n### Client Instantiation\n\nCreate an instance of the `GoogleAdsClient` object.\n\n```php\nuse GoogleAdsGoogleAdsLibOAuth2TokenBuilder;\nuse GoogleAdsGoogleAdsLibGoogleAdsClientBuilder;\n\n$oAuth2Credential = (new OAuth2TokenBuilder())\n    ->fromFile('/path/to/google_ads_php.ini')\n    ->build();\n\n$googleAdsClient = (new GoogleAdsClientBuilder())\n    ->fromFile('/path/to/google_ads_php.ini')\n    ->withOAuth2Credential($oAuth2Credential)\n    ->build();\n```\n\n### Retrieving Campaigns\n\nUse the `GoogleAdsService.SearchStream` method to retrieve campaign data.\n\n```php\nuse GoogleAdsGoogleAdsLibGoogleAdsClient;\nuse GoogleAdsGoogleAdsLibGoogleAdsServerStreamDecorator;\nuse GoogleAdsGoogleAdsV15ServicesSearchGoogleAdsStreamRequest;\nuse GoogleAdsGoogleAdsV15ResourcesGoogleAdsRow;\n\npublic static function runExample(GoogleAdsClient $googleAdsClient, int $customerId)\n{\n    $googleAdsServiceClient = $googleAdsClient->getGoogleAdsServiceClient();\n    // Creates a query that retrieves all campaigns.\n    $query = 'SELECT campaign.id, campaign.name FROM campaign ORDER BY campaign.id';\n    // Issues a search stream request.\n    /** @var GoogleAdsServerStreamDecorator $stream */\n    $stream = $googleAdsServiceClient->searchStream(\n        SearchGoogleAdsStreamRequest::build($customerId, $query)\n    );\n\n    // Iterates over all rows in all messages and prints the requested field values for\n    // the campaign in each row.\n    foreach ($stream->iterateAllElements() as $googleAdsRow) {\n        /** @var GoogleAdsRow $googleAdsRow */\n        printf(\n            \"Campaign with ID %d and name '%s' was found.%s\",\n            $googleAdsRow->getCampaign()->getId(),\n            $googleAdsRow->getCampaign()->getName(),\n            PHP_EOL\n        );\n    }\n}\n```\n\n*File: GetCampaigns.php*"
        }
      ],
      "relevance": 0.027526395,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "C# Client Library Setup and Campaign Retrieval",
      "codeDescription": "Instructions for setting up the C# client library for Google Ads, including NuGet package installation, configuration, and an example of retrieving campaigns using `GoogleAdsService.SearchStream`.",
      "codeLanguage": "APIDOC",
      "codeTokens": 453,
      "codeId": "https://github.com/context7/developers_google_com-google-ads-api-docs/blob/main/first-call/get-campaigns.md#_snippet_20",
      "pageTitle": "Google Ads API Quick Start Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "## C# Client Library\n\n### Description\nThis section details how to set up and use the Google Ads API C# client library to retrieve campaign information.\n\n### NuGet Package Installation\nRun the following command:\n```bash\ndotnet add package Google.Ads.GoogleAds --version 18.1.0\n```\n\n### Configuration\nCreate a `GoogleAdsConfig` object with the relevant settings:\n```csharp\nGoogleAdsConfig config = new GoogleAdsConfig()\n{\n    DeveloperToken = \"******\",\n    OAuth2Mode = OAuth2Flow.SERVICE_ACCOUNT,\n    OAuth2SecretsJsonPath = \"PATH_TO_CREDENTIALS_JSON\",\n    LoginCustomerId = ******\n};\nGoogleAdsClient client = new GoogleAdsClient(config);\n```\n\n### Retrieve Campaigns\n```csharp\npublic void Run(GoogleAdsClient client, long customerId)\n{\n    // Get the GoogleAdsService.\n    GoogleAdsServiceClient googleAdsService = client.GetService(\n        Services.V21.GoogleAdsService);\n\n    // Create a query that will retrieve all campaigns.\n    string query = @\"SELECT\n                    campaign.id,\n                    campaign.name,\n                    campaign.network_settings.target_content_network\n                FROM campaign\n                ORDER BY campaign.id\";\n\n    try\n    {\n        // Issue a search request.\n        googleAdsService.SearchStream(customerId.ToString(), query,\n            delegate (SearchGoogleAdsStreamResponse resp)\n            {\n                foreach (GoogleAdsRow googleAdsRow in resp.Results)\n                {\n                    Console.WriteLine(\"Campaign with ID {0} and name '{1}' was found.\",\n                        googleAdsRow.Campaign.Id, googleAdsRow.Campaign.Name);\n                }\n            }\n        );\n    }\n    catch (GoogleAdsException e)\n    {\n        Console.WriteLine(\"Failure:\");\n        Console.WriteLine($\"Message: {e.Message}\");\n        Console.WriteLine($\"Failure: {e.Failure}\");\n        Console.WriteLine($\"Request ID: {e.RequestId}\");\n        throw;\n    }\n}\n```"
        }
      ],
      "relevance": 0.027500924,
      "model": "gemini-2.5-flash-lite"
    }
  ],
  "metadata": {
    "authentication": "personal"
  }
}