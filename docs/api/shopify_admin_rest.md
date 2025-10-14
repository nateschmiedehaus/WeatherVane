{
  "snippets": [
    {
      "codeTitle": "Install Shopify API PHP",
      "codeDescription": "Install the Shopify API PHP library using Composer. Ensure you have PHP 7.3 or higher installed.",
      "codeLanguage": "bash",
      "codeTokens": 51,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/getting_started.md#_snippet_0",
      "pageTitle": "Shopify API PHP: Getting Started",
      "codeList": [
        {
          "language": "bash",
          "code": "composer require shopify/shopify-api"
        }
      ],
      "relevance": 0.033333335,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Initialize Shopify API PHP Context",
      "codeDescription": "Initialize the Shopify API PHP library by calling the `Shopify\\Context::initialize` method with your application's configuration settings. This includes API keys, scopes, host name, and session storage. It's recommended to call this early in your application.",
      "codeLanguage": "php",
      "codeTokens": 190,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/getting_started.md#_snippet_1",
      "pageTitle": "Shopify API PHP: Getting Started",
      "codeList": [
        {
          "language": "php",
          "code": "use Shopify\\Context;\nuse Shopify\\Utils\\ApiVersion;\nuse Shopify\\SessionStorage\\FileSessionStorage;\n\nContext::initialize(\n    apiKey: $_ENV['SHOPIFY_API_KEY'],\n    apiSecretKey: $_ENV['SHOPIFY_API_SECRET'],\n    scopes: $_ENV['SHOPIFY_APP_SCOPES'],\n    hostName: $_ENV['SHOPIFY_APP_HOST_NAME'],\n    sessionStorage: new FileSessionStorage('/tmp/php_sessions'),\n    apiVersion: '2024-10',\n    isEmbeddedApp: true,\n    isPrivateApp: false,\n);"
        }
      ],
      "relevance": 0.032786883,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Composer Dependencies",
      "codeDescription": "Installs the necessary dependencies for the Shopify API library using Composer.",
      "codeLanguage": "Shell",
      "codeTokens": 37,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/README.md#_snippet_0",
      "pageTitle": "Shopify API Library for PHP",
      "codeList": [
        {
          "language": "Shell",
          "code": "composer install"
        }
      ],
      "relevance": 0.032258064,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Run Tests with Code Coverage",
      "codeDescription": "Runs tests and generates code coverage reports (text or HTML) after installing the xdebug extension.",
      "codeLanguage": "Shell",
      "codeTokens": 53,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/README.md#_snippet_2",
      "pageTitle": "Shopify API Library for PHP",
      "codeList": [
        {
          "language": "Shell",
          "code": "composer test -- [--coverage-text|--coverage-html=<path>]"
        }
      ],
      "relevance": 0.031009614,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Query Products using Storefront API (PHP)",
      "codeDescription": "This example shows how to query product data from the Shopify Storefront API using the `ShopifyClientsStorefront` client. It requires the shop URL and a valid Storefront Access Token. The query is sent as a GraphQL string.",
      "codeLanguage": "php",
      "codeTokens": 228,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/storefront.md#_snippet_1",
      "pageTitle": "Shopify PHP SDK: Make a Storefront API call",
      "codeList": [
        {
          "language": "php",
          "code": "// Load the access token as per instructions above\n$storefrontAccessToken = '<my token>';\n// Shop from which we're fetching data\n$shop = 'my-shop.myshopify.com';\n\n// The Storefront client takes in the shop url and the Storefront Access Token for that shop.\n$storefrontClient = new \\Shopify\\Clients\\Storefront($shop, $storefrontAccessToken);\n\n// Call query and pass your query as `data`\n$products = $storefrontClient->query(\n    data: <<<QUERY\n    {\n        products (first: 10) {\n            edges {\n                node {\n                    id\n                    title\n                    descriptionHtml\n                }\n            }\n        }\n    }\n    QUERY,\n);\n\n// do something with the returned data"
        }
      ],
      "relevance": 0.030076887,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Register APP_UNINSTALLED Webhook (PHP)",
      "codeDescription": "This PHP code snippet demonstrates how to register a webhook for the 'APP_UNINSTALLED' topic using the Shopify PHP API. It shows the usage of `ShopifyWebhooksRegistry::register` with a specific path, topic, shop, and access token. The example includes checking the success of the registration and logging a failure message.",
      "codeLanguage": "php",
      "codeTokens": 199,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/webhooks.md#_snippet_2",
      "pageTitle": "Shopify API PHP Webhooks",
      "codeList": [
        {
          "language": "php",
          "code": "function oauthCallbackAction()\n{\n    $session = OAuth::callback( ... );\n\n    $response = Shopify\\Webhooks\\Registry::register(\n        '/shopify/webhooks',\n        Shopify\\Webhooks\\Topics::APP_UNINSTALLED,\n        $session->getShop(),\n        $session->getAccessToken(),\n    );\n\n    if ($response->isSuccess()) {\n        // Webhook registered!\n    } else {\n        \\My\\App::log(\"Webhook registration failed with response: \\n\" . var_export($response, true));\n    }\n}"
        }
      ],
      "relevance": 0.028991597,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Shopify PHP REST Client - Get Products",
      "codeDescription": "Demonstrates how to retrieve a list of products from a Shopify store using the `ShopifyClientsRest` class. This method makes a GET request to the 'products' endpoint. The response object contains status code, body, and headers, with a convenience method to get the decoded JSON body.",
      "codeLanguage": "PHP",
      "codeTokens": 117,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/rest.md#_snippet_0",
      "pageTitle": "Shopify PHP API - REST Admin API",
      "codeList": [
        {
          "language": "php",
          "code": "use Shopify\\Clients\\Rest;\n\n$client = new Rest($session->getShop(), $session->getAccessToken());\n$response = $client->get(path: 'products');"
        }
      ],
      "relevance": 0.028218696,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Query Parameters from URL in PHP",
      "codeDescription": "Extracts query string arguments from a given URL. This method takes a URL string as input and returns an associative array of the parsed query parameters.",
      "codeLanguage": "php",
      "codeTokens": 105,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_1",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n$params = Shopify\\Utils::getQueryParams('https://example.com?key1=value1&key2=value2');\n// $params will be ['key1' => 'value1', 'key2' => 'value2']\n\n?>"
        }
      ],
      "relevance": 0.027884616,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "PHP: Custom Set Cookie Function for Yii Framework",
      "codeDescription": "Provides an example of a custom function to set cookies within the Yii framework, overriding the default `setcookie` method for the Shopify OAuth process. This is useful for frameworks that do not directly use PHP's `setcookie` function.",
      "codeLanguage": "php",
      "codeTokens": 171,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/oauth.md#_snippet_0",
      "pageTitle": "Shopify PHP API: Performing OAuth",
      "codeList": [
        {
          "language": "php",
          "code": "function () use (Shopify\\Auth\\OAuthCookie $cookie) {\n    $cookies = Yii::$app->response->cookies;\n    $cookies->add(new \\yii\\web\\Cookie([\n        'name' => $cookie->getName(),\n        'value' => $cookie->getValue(),\n        'expire' => $cookie->getExpire(),\n        'secure' => $cookie->isSecure(),\n        'httpOnly' => $cookie->isSecure(),\n    ]));\n\n    return true;\n}"
        }
      ],
      "relevance": 0.025914384,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Retrieving Next Page with Serialized Page Info (Shopify PHP API)",
      "codeDescription": "This snippet shows how to unserialize previously saved pagination information and use it to fetch the next page of results from a Shopify REST endpoint. It utilizes the getNextPageQuery() method to get the necessary query parameters for the next page request.",
      "codeLanguage": "php",
      "codeTokens": 95,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/rest.md#_snippet_2",
      "pageTitle": "Shopify PHP REST Admin API Client",
      "codeList": [
        {
          "language": "php",
          "code": "$pageInfo = unserialize($serializedPageInfo);\n$result = $client->get(path: 'products', query: $pageInfo->getNextPageQuery());"
        }
      ],
      "relevance": 0.02585639,
      "model": "gemini-2.5-flash-preview-04-17"
    },
    {
      "codeTitle": "Run Tests with Composer",
      "codeDescription": "Executes the test suite for the Shopify API library using Composer.",
      "codeLanguage": "Shell",
      "codeTokens": 36,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/README.md#_snippet_1",
      "pageTitle": "Shopify API Library for PHP",
      "codeList": [
        {
          "language": "Shell",
          "code": "composer test"
        }
      ],
      "relevance": 0.015873017,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Run Linter with Composer",
      "codeDescription": "Runs the linter to check code quality using Composer.",
      "codeLanguage": "Shell",
      "codeTokens": 35,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/README.md#_snippet_4",
      "pageTitle": "Shopify API Library for PHP",
      "codeList": [
        {
          "language": "Shell",
          "code": "composer lint"
        }
      ],
      "relevance": 0.015625,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Shopify PHP: Basic GraphQL Query",
      "codeDescription": "Demonstrates how to instantiate the Shopify PHP GraphQL client and execute a basic query to fetch product data. It requires loading the current session to obtain the access token and shop URL.",
      "codeLanguage": "PHP",
      "codeTokens": 184,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/graphql.md#_snippet_0",
      "pageTitle": "Shopify PHP API: Make a GraphQL API call",
      "codeList": [
        {
          "language": "PHP",
          "code": "// Load current session to get `accessToken`\n$session = Shopify\\Utils::loadCurrentSession($headers, $cookies, $isOnline);\n// Create GraphQL client\n$client = new Shopify\\Clients\\Graphql($session->getShop(), $session->getAccessToken());\n// Use `query` method and pass your query as `data`\n$queryString = <<<QUERY\n    {\n        products (first: 10) {\n            edges {\n                node {\n                    id\n                    title\n                    descriptionHtml\n                }\n            }\n        }\n    }\nQUERY;\n$response = $client->query(data: $queryString);"
        }
      ],
      "relevance": 0.015151516,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Validate and Normalize Composer Configuration",
      "codeDescription": "Validates the composer.json file and normalizes its format.",
      "codeLanguage": "Shell",
      "codeTokens": 38,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/README.md#_snippet_5",
      "pageTitle": "Shopify API Library for PHP",
      "codeList": [
        {
          "language": "Shell",
          "code": "composer validate\ncomposer normalize"
        }
      ],
      "relevance": 0.014705882,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Stage Release Files",
      "codeDescription": "Stages the CHANGELOG.md and src/version.php files for commit. These files contain the release notes and the new version number, respectively.",
      "codeLanguage": "bash",
      "codeTokens": 58,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/RELEASING.md#_snippet_1",
      "pageTitle": "Releasing Shopify PHP API",
      "codeList": [
        {
          "language": "bash",
          "code": "git add CHANGELOG.md src/version.php"
        }
      ],
      "relevance": 0.014492754,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Update Local Repository",
      "codeDescription": "Ensures the local Git repository is up-to-date with the main branch before proceeding with a release. This involves checking out the main branch and pulling the latest changes.",
      "codeLanguage": "bash",
      "codeTokens": 61,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/RELEASING.md#_snippet_0",
      "pageTitle": "Releasing Shopify PHP API",
      "codeList": [
        {
          "language": "bash",
          "code": "git checkout main && git pull"
        }
      ],
      "relevance": 0.014084507,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Create Storefront API Access Token (PHP)",
      "codeDescription": "This snippet demonstrates how to create a new Storefront API access token using the Shopify PHP SDK's REST client. It requires an existing Admin API session and makes a POST request to the 'storefront_access_tokens' endpoint.",
      "codeLanguage": "php",
      "codeTokens": 178,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/storefront.md#_snippet_0",
      "pageTitle": "Shopify PHP SDK: Make a Storefront API call",
      "codeList": [
        {
          "language": "php",
          "code": "// Create a REST client from your offline session\n$client = new \\Shopify\\Clients\\Rest($session->getShop(), $session->getAccessToken());\n\n// Create a new access token\n$storefrontTokenResponse = $client->post(\n    'storefront_access_tokens',\n    [\n        \"storefront_access_token\" => [\n            \"title\" => \"This is my test access token\",\n        ]\n    ],\n);\n$storefrontAccessToken = $storefrontTokenResponse->getBody()['storefront_access_token']['access_token'];"
        }
      ],
      "relevance": 0.013888889,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "GraphQL Proxy Request in PHP",
      "codeDescription": "Forwards GraphQL queries to Shopify and returns the response. This method requires HTTP headers, cookies, and the raw request body. It returns an HttpResponse object.",
      "codeLanguage": "php",
      "codeTokens": 92,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_7",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n$response = Shopify\\Utils::graphqlProxy($_SERVER, $_COOKIE, file_get_contents('php://input'));\n// $response will be an HttpResponse object\n\n?>"
        }
      ],
      "relevance": 0.01369863,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Clear Composer Autoload Cache",
      "codeDescription": "Clears the Composer autoload cache, typically needed after namespace changes.",
      "codeLanguage": "Shell",
      "codeTokens": 38,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/README.md#_snippet_3",
      "pageTitle": "Shopify API Library for PHP",
      "codeList": [
        {
          "language": "Shell",
          "code": "composer dump-autoload"
        }
      ],
      "relevance": 0.013513514,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Implement Shopify Webhook Handler Interface in PHP",
      "codeDescription": "This snippet shows the implementation of the `Shopify\\Webhooks\\Handler` interface in PHP. It includes the `handle` method, which is called by the Shopify library when a webhook for the registered topic is received, along with its parameters.",
      "codeLanguage": "php",
      "codeTokens": 124,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/webhooks.md#_snippet_1",
      "pageTitle": "Shopify API PHP Webhooks",
      "codeList": [
        {
          "language": "php",
          "code": "namespace App\\Webhook\\Handlers;\n\nuse Shopify\\Webhooks\\Handler;\n\nclass AppUninstalled implements Handler\n{\n    public function handle(string $topic, string $shop, array $requestBody): void\n    {\n        // Handle your webhook here!\n    }\n}"
        }
      ],
      "relevance": 0.013333334,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "PHP Shopify SessionStorage Interface Methods",
      "codeDescription": "Defines the methods required for implementing custom session storage in the Shopify API PHP SDK. These methods handle storing, loading, and deleting session data, crucial for OAuth processes.",
      "codeLanguage": "PHP",
      "codeTokens": 229,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/issues.md#_snippet_0",
      "pageTitle": "Shopify API PHP SDK: Session Handling Caveats",
      "codeList": [
        {
          "language": "PHP",
          "code": "interface SessionStorage {\n    /**\n     * Creates or updates a Session object in your storage.\n     *\n     * @param Session $session The session object to store\n     * @return bool Whether the operation was successful\n     */\n    public function storeSession(Session $session): bool;\n\n    /**\n     * Fetches a Session object from your storage.\n     *\n     * @param string $sessionId The id of the session to load\n     * @return Session|null The session object, or null if not found\n     */\n    public function loadSession(string $sessionId): ?Session;\n\n    /**\n     * Deletes a session from your storage.\n     *\n     * @param string $sessionId The id of the session to delete\n     * @return bool Whether the operation was successful\n     */\n    public function deleteSession(string $sessionId): bool;\n}"
        }
      ],
      "relevance": 0.013157895,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Shopify PHP: GraphQL Query with Variables",
      "codeDescription": "Shows how to perform a GraphQL mutation using the Shopify PHP API, including passing variables to the mutation. This involves constructing a mutation string with variables and providing a separate array for the variable values.",
      "codeLanguage": "PHP",
      "codeTokens": 215,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/graphql.md#_snippet_1",
      "pageTitle": "Shopify PHP API: Make a GraphQL API call",
      "codeList": [
        {
          "language": "PHP",
          "code": "// load current session and create GraphQL client like above example\n\n// Use `query` method, passing the query and variables in an array as `data`\n$queryUsingVariables = <<<QUERY\n    mutation productCreate($input: ProductInput!) {\n        productCreate(input: $input) {\n            product {\n                id\n            }\n        }\n    }\nQUERY;\n$variables = [\n    \"input\" => [\n        [\"title\" => \"TARDIS\"],\n        [\"descriptionHtml\" => \"Time and Relative Dimensions in Space\"],\n        [\"productType\" => \"Time Lord technology\"]\n    ]\n];\n$response = $client->query(data: ['query' => $queryUsingVariables, 'variables' => $variables]);\n\n// do something with the returned data"
        }
      ],
      "relevance": 0.012987013,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Check API Version Compatibility in PHP",
      "codeDescription": "Compares the app's current API version with a reference version. It returns true if the app's version is more recent than or equal to the reference version.",
      "codeLanguage": "php",
      "codeTokens": 98,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_4",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n// Assuming Context::$API_VERSION is set\n$isCompatible = Shopify\\Utils::isApiVersionCompatible('2023-01');\n// $isCompatible will be true or false\n\n?>"
        }
      ],
      "relevance": 0.012820513,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Register App Uninstalled Webhook Handler in PHP",
      "codeDescription": "This snippet demonstrates how to register a custom handler for the 'APP_UNINSTALLED' webhook topic using the Shopify API for PHP. It shows the necessary use statements and the call to `Registry::addHandler`.",
      "codeLanguage": "php",
      "codeTokens": 106,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/webhooks.md#_snippet_0",
      "pageTitle": "Shopify API PHP Webhooks",
      "codeList": [
        {
          "language": "php",
          "code": "use Shopify\\Webhooks\\Registry;\nuse Shopify\\Webhooks\\Topics;\nuse App\\Webhook\\Handlers\\AppUninstalled;\n\nRegistry::addHandler(Topics::APP_UNINSTALLED, new AppUninstalled());"
        }
      ],
      "relevance": 0.012658228,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "PHP: Generate Embedded App URL with getEmbeddedAppUrl",
      "codeDescription": "This function generates the Shopify URL for embedded applications. It requires a base64-encoded host string as input and returns the constructed URL string. This method is more reliable than using the shop parameter for directing merchants.",
      "codeLanguage": "php",
      "codeTokens": 305,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_8",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n/**\n * Produces the Shopify URL that should load the embedded app, and ensures the embedded app URL is properly constructed and brings the merchant to the right place.\n * It's more reliable than using the shop param.\n *\n * @param string $host Base64-encoded host argument received from Shopify\n *\n * @return string The embedded app URL\n */\nfunction getEmbeddedAppUrl(string $host): string\n{\n    // Implementation details would go here, likely involving base64 decoding and URL construction\n    // For example:\n    $decodedHost = base64_decode($host);\n    // Assuming $decodedHost is something like 'your-app-name.myshopify.com'\n    // You would then construct the full URL, e.g.:\n    // return \"https://{$decodedHost}/admin/apps/your-app-id/embedded\";\n    \n    // Placeholder return for demonstration\n    return \"https://\" . base64_decode($host) . \"/admin/apps/your-app-id/embedded\";\n}\n\n// Example Usage:\n// $encodedHost = base64_encode('your-app-name.myshopify.com');\n// $appUrl = getEmbeddedAppUrl($encodedHost);\n// echo $appUrl;\n\n?>"
        }
      ],
      "relevance": 0.0121951215,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Process Shopify Webhooks in PHP",
      "codeDescription": "This snippet shows how to process incoming Shopify webhook requests using the Shopify API for PHP. It includes validating the request, checking the response for success, logging messages, and handling potential exceptions during processing.",
      "codeLanguage": "php",
      "codeTokens": 224,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/webhooks.md#_snippet_3",
      "pageTitle": "Shopify API PHP Webhooks",
      "codeList": [
        {
          "language": "php",
          "code": "class ShopifyController\n{\n    public function webhooksAction($request)\n    {\n        try {\n            $response = Shopify\\Webhooks\\Registry::process($request->headers->toArray(), $request->getRawBody());\n\n            if ($response->isSuccess()) {\n                \\My\\App::log(\"Responded to webhook!\");\n                // Respond with HTTP 200 OK\n            }\n else {\n                // The webhook request was valid, but the handler threw an exception\n                \\My\\App::log(\"Webhook handler failed with message: \" . $response->getErrorMessage());\n            }\n        } catch (\\Exception $error) {\n            // The webhook request was not a valid one, likely a code error or it wasn't fired by Shopify\n            \\My\\App::log($error);\n        }\n    }\n}"
        }
      ],
      "relevance": 0.012048192,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Sanitize Shop Domain in PHP",
      "codeDescription": "Ensures a Shopify shop domain is formatted correctly as 'my-domain.myshopify.com'. It accepts the shop domain and an optional custom myshopify domain for testing. Returns a sanitized string or null if invalid.",
      "codeLanguage": "php",
      "codeTokens": 145,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_0",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n$sanitizedDomain = Shopify\\Utils::sanitizeShopDomain('example.com');\n// $sanitizedDomain will be 'example.com.myshopify.com'\n\n$sanitizedDomainWithCustom = Shopify\\Utils::sanitizeShopDomain('example.com', 'my-custom-domain.com');\n// $sanitizedDomainWithCustom will be 'example.com.my-custom-domain.com'\n\n?>"
        }
      ],
      "relevance": 0.011904762,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Load Current Session in PHP",
      "codeDescription": "Fetches the current user's session based on provided HTTP headers and cookies. It can load either online or offline sessions and returns a Session object or null.",
      "codeLanguage": "php",
      "codeTokens": 131,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_6",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n$session = Shopify\\Utils::loadCurrentSession($_SERVER, $_COOKIE, true); // Load online session\n// $session will be a Session object or null\n\n$offlineSession = Shopify\\Utils::loadCurrentSession($_SERVER, $_COOKIE, false); // Load offline session\n// $offlineSession will be a Session object or null\n\n?>"
        }
      ],
      "relevance": 0.011764706,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Implement Shopify Webhook Handler in PHP",
      "codeDescription": "This snippet demonstrates how to implement a custom webhook handler for Shopify in PHP. It defines a class that adheres to the `Shopify\\Webhooks\\Handler` interface, with a `handle` method to process the webhook's topic, shop details, and request body.",
      "codeLanguage": "php",
      "codeTokens": 129,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/webhooks.md#_snippet_4",
      "pageTitle": "Shopify API PHP Webhooks",
      "codeList": [
        {
          "language": "php",
          "code": "namespace App\\Webhook\\Handlers;\n\nuse Shopify\\Webhooks\\Handler;\n\nclass AppUninstalled implements Handler\n{\n    public function handle(string $topic, string $shop, array $requestBody): void\n    {\n        // Handle your webhook here!\n    }\n}"
        }
      ],
      "relevance": 0.011627907,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Load Offline Session in PHP",
      "codeDescription": "Retrieves an offline session for a given shop URL. This method optionally includes expired sessions and returns a Session object or null if no session is found. It does not validate the shop domain.",
      "codeLanguage": "php",
      "codeTokens": 120,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_5",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n$session = Shopify\\Utils::loadOfflineSession('example.com');\n// $session will be a Session object or null\n\n$sessionWithExpired = Shopify\\Utils::loadOfflineSession('example.com', true);\n// $sessionWithExpired will include expired sessions\n\n?>"
        }
      ],
      "relevance": 0.011494253,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Serialize and Unserialize Page Info in Shopify PHP API",
      "codeDescription": "Demonstrates how to serialize and unserialize page information obtained from a Shopify API response. This allows saving and retrieving pagination state between requests.",
      "codeLanguage": "php",
      "codeTokens": 138,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/rest.md#_snippet_1",
      "pageTitle": "Shopify PHP API - REST Admin API",
      "codeList": [
        {
          "language": "php",
          "code": "$serializedPageInfo = serialize($result->getPageInfo());"
        },
        {
          "language": "php",
          "code": "$pageInfo = unserialize($serializedPageInfo);\n$result = $client->get(path: 'products', query: $pageInfo->getNextPageQuery());"
        }
      ],
      "relevance": 0.011235955,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Decode Session Token (JWT) in PHP",
      "codeDescription": "Decodes a JSON Web Token (JWT) and extracts its payload using the API secret key. This method takes the JWT string as input and returns the decoded payload.",
      "codeLanguage": "php",
      "codeTokens": 98,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_3",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n// Assuming Context::$API_SECRET_KEY is set\n$payload = Shopify\\Utils::decodeSessionToken('your_jwt_token_here');\n// $payload will contain the JWT payload\n\n?>"
        }
      ],
      "relevance": 0.011111111,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Validate HMAC Signature in PHP",
      "codeDescription": "Verifies the authenticity of a request by checking its HMAC signature. It requires the URL query parameters and the app's secret key. Returns a boolean indicating validity.",
      "codeLanguage": "php",
      "codeTokens": 105,
      "codeId": "https://github.com/shopify/shopify-api-php/blob/main/docs/usage/utils.md#_snippet_2",
      "pageTitle": "Shopify API PHP Utility Methods",
      "codeList": [
        {
          "language": "php",
          "code": "<?php\n\n// Example usage:\n$isValid = Shopify\\Utils::validateHmac(['shop' => 'example.com', 'hmac' => 'some_hmac_hash'], 'your_secret_key');\n// $isValid will be true or false\n\n?>"
        }
      ],
      "relevance": 0.010869565,
      "model": "gemini-2.5-flash-lite"
    }
  ],
  "metadata": {
    "authentication": "personal"
  }
}