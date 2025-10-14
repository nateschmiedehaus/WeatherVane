{
  "snippets": [
    {
      "codeTitle": "Docker Deployment and Usage",
      "codeDescription": "This snippet covers the essential Docker commands for deploying the Open-Meteo API. It includes pulling the image, creating a data volume, starting the API service, synchronizing weather data, and making a forecast request.",
      "codeLanguage": "bash",
      "codeTokens": 278,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_0",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "# Get the latest image\ndocker pull ghcr.io/open-meteo/open-meteo\n\n# Create a Docker volume to store weather data\ndocker volume create --name open-meteo-data\n\n# Start the API service on http://127.0.0.1:8080\ndocker run -d --rm -v open-meteo-data:/app/data -p 8080:8080 ghcr.io/open-meteo/open-meteo\n\n# Download the latest ECMWF IFS 0.4° open-data forecast for temperature (150 MB)\ndocker run -it --rm -v open-meteo-data:/app/data ghcr.io/open-meteo/open-meteo sync ecmwf_ifs025 temperature_2m\n\n# Get your forecast\ncurl \"http://127.0.0.1:8080/v1/forecast?latitude=47.1&longitude=8.4&models=ecmwf_ifs025&hourly=temperature_2m\""
        }
      ],
      "relevance": 0.03306011,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Ubuntu APT Installation and Usage",
      "codeDescription": "This snippet details the process of installing and running the Open-Meteo API using APT on Ubuntu 22.04 Jammy Jellyfish. It includes adding the repository, installing the package, synchronizing weather data, and managing the service.",
      "codeLanguage": "bash",
      "codeTokens": 353,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_1",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "sudo gpg --keyserver hkps://keys.openpgp.org --no-default-keyring --keyring /usr/share/keyrings/openmeteo-archive-keyring.gpg  --recv-keys E6D9BD390F8226AE\necho \"deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/openmeteo-archive-keyring.gpg] https://apt.open-meteo.com $(lsb_release -cs) main\" | sudo tee /etc/apt/sources.list.d/openmeteo-api.list\n\nsudo apt update\nsudo apt install openmeteo-api\n\n# Download the latest ECMWF IFS 0.4° open-data forecast for temperature (50 MB)\nsudo chown -R $(id -u):$(id -g) /var/lib/openmeteo-api\ncd /var/lib/openmeteo-api\nopenmeteo-api sync ecmwf_ifs025 temperature_2m\n\n# Get your forecast\ncurl \"http://127.0.0.1:8080/v1/forecast?latitude=47.1&longitude=8.4&models=ecmwf_ifs025&hourly=temperature_2m\"\n\n# Service management commands\nsudo systemctl status openmeteo-api\nsudo systemctl restart openmeteo-api\nsudo journalctl -u openmeteo-api.service"
        }
      ],
      "relevance": 0.03226646,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Develop Open-Meteo on Linux Natively",
      "codeDescription": "Detailed instructions for setting up a native development environment on Ubuntu 22.04, including installing the Swift compiler, essential libraries (libnetcdf-dev, libeccodes-dev, libbz2-dev), and testing the Swift installation.",
      "codeLanguage": "bash",
      "codeTokens": 366,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/development.md#_snippet_3",
      "pageTitle": "Open-Meteo Build and Development Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "git clone https://github.com/open-meteo/open-meteo.git\ncd open-meteo\n\n# Install the swift compiler as pointed out in the Vapor development guide\nsudo apt install libnetcdf-dev libeccodes-dev libbz2-dev build-essential curl\nsudo apt-get install binutils git gnupg2 libc6-dev libcurl4-openssl-dev libedit2 libgcc-9-dev libpython3.8 \\\n  libsqlite3-0 libstdc++-9-dev libxml2-dev libz3-dev pkg-config tzdata unzip zlib1g-dev\nsudo apt install libbz2-dev libz-dev\n\nwget https://download.swift.org/swift-5.8.1-release/ubuntu2204/swift-5.8.1-RELEASE/swift-5.8.1-RELEASE-ubuntu22.04.tar.gz\ntar xvzf swift-5.8.1-RELEASE-ubuntu22.04.tar.gz\nsudo mv swift-5.8.1-RELEASE-ubuntu22.04 /opt\nln -s /opt/swift-5.8.1-RELEASE-ubuntu22.04/ /opt/swift\necho 'export PATH=/opt/swift/usr/bin:$PATH' >> ~/.bashrc\nsource ~/.bashrc\n\n# Test if swift is working\nswift --version\n\nswift run\nswift run openmeteo-api download-ecmwf --run 00"
        }
      ],
      "relevance": 0.031024532,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Open-Meteo CLI Sync Command",
      "codeDescription": "Demonstrates the usage of the 'sync' command to download weather models and variables from Open-Meteo. Requires specifying model names and desired variables.",
      "codeLanguage": "bash",
      "codeTokens": 127,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_3",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "open-meteo sync ecmwf_ifs025 temperature_2m,relative_humidity_2m,wind_u_component_10m,wind_v_component_10m\nopen-meteo sync dwd_icon,dwd_icon_eu,dwd_icon_d2 temperature_2m,dew_point_2m,relative_humidity_2m"
        }
      ],
      "relevance": 0.031009614,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Develop Open-Meteo on macOS",
      "codeDescription": "Guide for developing Open-Meteo on macOS, including cloning the repository, installing Xcode, Homebrew, and necessary dependencies like netcdf and bzip2, and opening the project's Swift package.",
      "codeLanguage": "bash",
      "codeTokens": 121,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/development.md#_snippet_2",
      "pageTitle": "Open-Meteo Build and Development Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "git clone https://github.com/open-meteo/open-meteo.git\ncd open-meteo\n\n# Install Xcode from the App store\n# Install brew\nbrew install netcdf bzip2\nopen Package.swift\n# `swift run` works as well"
        }
      ],
      "relevance": 0.030834913,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Open-Meteo Sync Service Management",
      "codeDescription": "Commands to manage the Open-Meteo synchronization service on Ubuntu. Includes checking status, restarting, and viewing logs.",
      "codeLanguage": "bash",
      "codeTokens": 74,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_5",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "sudo systemctl status openmeteo-sync\nsudo systemctl restart openmeteo-sync\nsudo journalctl -u openmeteo-sync.service"
        }
      ],
      "relevance": 0.030550372,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Open-Meteo Sync Service Configuration",
      "codeDescription": "Configuration file for the Open-Meteo synchronization service. Allows enabling sync, setting API keys, server, past days, domains, variables, and repeat interval.",
      "codeLanguage": "env",
      "codeTokens": 114,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_4",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "env",
          "code": "SYNC_ENABLED=true\nSYNC_APIKEY=\nSYNC_SERVER=\nSYNC_PAST_DAYS=3\nSYNC_DOMAINS=dwd_icon,ncep_gfs013,...\nSYNC_VARIABLES=temperature_2m,dew_point_2m,relative_humidity_2m,...\nSYNC_REPEAT_INTERVAL=5"
        }
      ],
      "relevance": 0.030309988,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Develop Open-Meteo with Docker",
      "codeDescription": "Instructions for setting up a development environment using Docker, including building a development image, running a container with specific security options, and executing Swift commands within the container.",
      "codeLanguage": "bash",
      "codeTokens": 201,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/development.md#_snippet_1",
      "pageTitle": "Open-Meteo Build and Development Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "git clone https://github.com/open-meteo/open-meteo.git\ncd open-meteo\n\n# Create a Docker volume to store weather data\ndocker volume create --name open-meteo-data\n\n# Install docker\ndocker build -f Dockerfile.development -t open-meteo-development .\ndocker run -it --security-opt seccomp=unసెcured --privileged -p 8080:8080 -v ${PWD}:/app -v open-meteo-data:/app/data -t open-meteo-development /bin/bash\n# Run commands inside docker container:\nswift run\nswift run openmeteo-api download-ecmwf --run 00"
        }
      ],
      "relevance": 0.030180182,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Build and Run Open-Meteo Docker Image",
      "codeDescription": "Steps to clone the Open-Meteo repository, build the Docker image, create a data volume, and run the API service. It also includes commands for syncing weather data and fetching forecasts.",
      "codeLanguage": "bash",
      "codeTokens": 306,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/development.md#_snippet_0",
      "pageTitle": "Open-Meteo Build and Development Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "# Get Source code\ngit clone https://github.com/open-meteo/open-meteo.git\ncd open-meteo\n\n# Build Docker image\ndocker build -t open-meteo .\n\n# Create a Docker volume to store weather data\ndocker volume create --name open-meteo-data\n\n# Start the API service on http://127.0.0.1:8080\ndocker run -d --rm -v open-meteo-data:/app/data -p 8080:8080 open-meteo\n\n# Download the digital elevation model\ndocker run -it --rm -v open-meteo-data:/app/data open-meteo sync copernicus_dem90 static\n\n# Download global temperature forecast from GFS 13 km resolution \ndocker run -it --rm -v open-meteo-data:/app/data open-meteo sync ncep_gfs013 temperature_2m --past-days 3\n\n# Get your forecast\ncurl \"http://127.0.0.1:8080/v1/forecast?latitude=47.1&longitude=8.4&models=gfs_global&hourly=temperature_2m\""
        }
      ],
      "relevance": 0.029462365,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Open-Meteo API Forecast Endpoint",
      "codeDescription": "This entry documents the `/v1/forecast` endpoint for the Open-Meteo API. It details the required parameters for requesting weather forecasts, including latitude, longitude, models, and hourly variables.",
      "codeLanguage": "APIDOC",
      "codeTokens": 325,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_2",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "Open-Meteo API - /v1/forecast\n\nDescription:\n  Retrieves weather forecast data for a specified location and time.\n\nParameters:\n  - latitude (float, required): The latitude of the location.\n  - longitude (float, required): The longitude of the location.\n  - models (string, required): A comma-separated list of weather models to query (e.g., \"ecmwf_ifs025\").\n  - hourly (string, optional): A comma-separated list of hourly weather variables to retrieve (e.g., \"temperature_2m\").\n  - daily (string, optional): A comma-separated list of daily weather variables to retrieve.\n  - timezone (string, optional): The timezone for daily data (e.g., \"Europe/Berlin\").\n  - start_date (string, optional): The start date for daily forecasts (YYYY-MM-DD).\n  - end_date (string, optional): The end date for daily forecasts (YYYY-MM-DD).\n\nExample Request:\n  GET http://127.0.0.1:8080/v1/forecast?latitude=47.1&longitude=8.4&models=ecmwf_ifs025&hourly=temperature_2m\n\nReturns:\n  JSON object containing the requested weather forecast data."
        }
      ],
      "relevance": 0.029236022,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Installing GDAL (Linux)",
      "codeDescription": "This command installs the GDAL (Geospatial Data Abstraction Library) on Debian/Ubuntu-based Linux systems using `apt`. GDAL is required for converting the downloaded Copernicus DEM files into a usable format for the Elevation API.",
      "codeLanguage": "Shell",
      "codeTokens": 76,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_8",
      "pageTitle": "Downloading Weather Datasets with Open-Meteo API",
      "codeList": [
        {
          "language": "Shell",
          "code": "apt install gdal"
        }
      ],
      "relevance": 0.028778467,
      "model": "gemini-2.5-flash-preview-05-20"
    },
    {
      "codeTitle": "Installing GDAL (macOS)",
      "codeDescription": "This command installs the GDAL (Geospatial Data Abstraction Library) on macOS using Homebrew. GDAL is required for converting the downloaded Copernicus DEM files into a usable format for the Elevation API.",
      "codeLanguage": "Shell",
      "codeTokens": 71,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_7",
      "pageTitle": "Downloading Weather Datasets with Open-Meteo API",
      "codeList": [
        {
          "language": "Shell",
          "code": "brew install gdal"
        }
      ],
      "relevance": 0.028191384,
      "model": "gemini-2.5-flash-preview-05-20"
    },
    {
      "codeTitle": "DIY Arduino Weather Station",
      "codeDescription": "An example of an esp8266 weather station using the Open-Meteo API, implemented in embedded C++.",
      "codeLanguage": "C++",
      "codeTokens": 146,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/README.md#_snippet_9",
      "pageTitle": "Open-Meteo Weather API Documentation",
      "codeList": [
        {
          "language": "C++",
          "code": "#include <HTTPClient.h>\n#include <ArduinoJson.h>\n\nvoid setup() {\n  Serial.begin(115200);\n  HTTPClient http;\n  http.begin(\"https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true\");\n  int httpCode = http.GET();\n\n  if (httpCode > 0) {\n    String payload = http.getString();\n    Serial.println(payload);\n  }\n  http.end();\n}"
        }
      ],
      "relevance": 0.02759802,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Converting Downloaded DEM Data (Shell)",
      "codeDescription": "This command converts the raw 90-meter Copernicus DEM files, previously downloaded into the `dem-90m` directory, into a format suitable for the Elevation API. This step requires GDAL to be installed and available.",
      "codeLanguage": "Shell",
      "codeTokens": 80,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_12",
      "pageTitle": "Downloading Weather Datasets with Open-Meteo API",
      "codeList": [
        {
          "language": "Shell",
          "code": "openmeteo-api download-dem dem-90m"
        }
      ],
      "relevance": 0.025206087,
      "model": "gemini-2.5-flash-preview-05-20"
    },
    {
      "codeTitle": "Open-Meteo Weather API",
      "codeDescription": "Provides access to weather data. The API is hosted at https://api.open-meteo.com and supports HTTPS. Example usage includes specifying latitude, longitude, and desired weather parameters.",
      "codeLanguage": "APIDOC",
      "codeTokens": 267,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/README.md#_snippet_1",
      "pageTitle": "Open-Meteo Weather API Documentation",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "GET https://api.open-meteo.com/v1/forecast\n\nParameters:\n  latitude: float - Latitude of the location.\n  longitude: float - Longitude of the location.\n  hourly: string - Comma-separated list of hourly weather parameters (e.g., temperature_2m,windspeed_10m).\n  daily: string - Comma-separated list of daily weather parameters (e.g., temperature_2m_max,precipitation_sum).\n  timezone: string - Timezone for the response (e.g., 'GMT', 'America/New_York'). Defaults to UTC.\n  past_days: integer - Number of past days to include in the forecast. Defaults to 0.\n  forecast_days: integer - Number of forecast days to include. Defaults to 16.\n\nExample:\n  https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&hourly=temperature_2m&daily=temperature_2m_max&timezone=GMT"
        }
      ],
      "relevance": 0.02480974,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Download Digital Elevation Model (DEM)",
      "codeDescription": "Instructions for downloading the 90-meter Copernicus Digital Elevation Model using AWS CLI. Includes installation guidance for AWS CLI and GDAL.",
      "codeLanguage": "bash",
      "codeTokens": 150,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_6",
      "pageTitle": "Open-Meteo Data Downloading",
      "codeList": [
        {
          "language": "bash",
          "code": "sudo apt-get install awscli\naws s3 sync --no-sign-request --exclude \"*\" --include \"Copernicus_DSM_COG_30*/*_DEM.tif\" s3://copernicus-dem-90m/ dem-90m\n\n# Requirements:\n# Mac: brew install gdal\n# Linux: apt install gdal\n\n# Conversion and cleanup:\n<exe> download-dem dem-90m\nrm -R dem-90m data/dem90/"
        }
      ],
      "relevance": 0.02409297,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Automated Data Removal Cronjobs",
      "codeDescription": "Cron jobs for automating the removal of old weather data files. Configured to delete pressure level data older than 10 days and surface level data older than 90 days.",
      "codeLanguage": "bash",
      "codeTokens": 149,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/getting-started.md#_snippet_6",
      "pageTitle": "Open-Meteo Installation and Usage Guide",
      "codeList": [
        {
          "language": "bash",
          "code": "# Remove pressure level data after 10 days\n0 * * * * find /var/lib/openmeteo-api/data/ -type f -name \"chunk_*\" -wholename \"*hPa*\" -mtime +10 -delete\n\n# Remove surface level data after 90 days\n5 * * * * find /var/lib/openmeteo-api/data/ -type f -name \"chunk_*\" -mtime +90 -delete"
        }
      ],
      "relevance": 0.022579897,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Open-Meteo Client SDKs",
      "codeDescription": "A list of available client SDKs for interacting with the Open-Meteo API across different programming languages.",
      "codeLanguage": "APIDOC",
      "codeTokens": 673,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/README.md#_snippet_12",
      "pageTitle": "Open-Meteo Weather API Documentation",
      "codeList": [
        {
          "language": "Go",
          "code": "https://github.com/HectorMalot/omgo"
        },
        {
          "language": "Python",
          "code": "https://github.com/m0rp43us/openmeteopy"
        },
        {
          "language": "Kotlin",
          "code": "https://github.com/open-meteo/open-meteo-api-kotlin"
        },
        {
          "language": ".Net / C#",
          "code": "https://github.com/AlienDwarf/open-meteo-dotnet"
        },
        {
          "language": "dotnet 8 / C#",
          "code": "https://github.com/colinnuk/open-meteo-dotnet-client-sdk"
        },
        {
          "language": "PHP Laravel",
          "code": "https://github.com/michaelnabil230/laravel-weather"
        },
        {
          "language": "R",
          "code": "https://github.com/tpisel/openmeteo"
        },
        {
          "language": "PHP Symfony 6.2",
          "code": "https://gitlab.com/flibidi67/open-meteo"
        },
        {
          "language": "PHP for Geocoding API",
          "code": "https://gitlab.com/flibidi67/open-meteo-geocoding"
        },
        {
          "language": "Android library for Geocoding API",
          "code": "https://github.com/woheller69/OmGeoDialog"
        },
        {
          "language": "Dart / Flutter",
          "code": "https://github.com/neursh/open-meteo-dart"
        },
        {
          "language": "Rust",
          "code": "https://github.com/angelodlfrtr/open-meteo-rs"
        }
      ],
      "relevance": 0.014285714,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Open-Meteo API Commands Overview",
      "codeDescription": "Lists the available commands for the open-meteo API, used for managing and downloading weather data. Each command has specific functionalities related to benchmarking, data conversion, downloading various weather models, exporting data, and serving the application.",
      "codeLanguage": "APIDOC",
      "codeTokens": 385,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_0",
      "pageTitle": "Open-Meteo Data Downloading",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "OpenMeteo API Commands:\n\n  benchmark: Benchmark Open-Meteo core functions like data manipulation and compression.\n  boot: Boots the application's providers.\n  convert-om: Convert an om file to NetCDF.\n  cronjob: Emits the cronjob definition.\n  download: Download a specified icon model run.\n  download-cams: Download global and European CAMS air quality forecasts.\n  download-cmip6: Download CMIP6 data and convert.\n  download-dem: Convert digital elevation model.\n  download-ecmwf: Download a specified ecmwf model run.\n  download-era5: Download ERA5 from the ECMWF climate data store and convert.\n  download-gem: Download Gem models.\n  download-gfs: Download GFS from NOAA NCEP.\n  download-glofas: Download river discharge data from GloFAS.\n  download-iconwave: Download a specified wave model run.\n  download-jma: Download JMA models.\n  download-meteofrance: Download MeteoFrance models.\n  download-metno: Download MetNo models.\n  download-satellite: Download satellite datasets.\n  download-seasonal-forecast: Download seasonal forecasts from Copernicus.\n  export: Export dataset to NetCDF.\n  routes: Displays all registered routes.\n  serve: Begins serving the app over HTTP.\n  sync: Synchronise weather database from a remote server.\n\nUse `/usr/local/bin/openmeteo-api <command> [--help,-h]` for more information on a command."
        }
      ],
      "relevance": 0.013888889,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "DWD ICON Download Command Arguments",
      "codeDescription": "Details the arguments and options available for the `openmeteo-api download` command when used for downloading DWD ICON model runs. It specifies the required domain and run, and optional flags for controlling the download process.",
      "codeLanguage": "APIDOC",
      "codeTokens": 183,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_2",
      "pageTitle": "Open-Meteo Data Downloading",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "openmeteo-api download <domain> <run> [--only-variables] [--skip-existing]\n\nDownload a specified icon model run\n\nArguments:\n         domain            The domain of the ICON model (e.g., 'icon', 'icon-eu', 'icon-d2').\n         run               The model run time (e.g., '00', '06', '12', '18').\nOptions:\n  only-variables       Specify a comma-separated list of weather variables to download.\nFlags:\n  skip-existing        If set, existing files will not be re-downloaded."
        }
      ],
      "relevance": 0.013333334,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "ERA5 Download Command Options",
      "codeDescription": "Helpful options for the `download-era5` command, including specifying the time interval, downloading a full year, and providing the CDS API key.",
      "codeLanguage": "APIDOC",
      "codeTokens": 158,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_5",
      "pageTitle": "Open-Meteo Data Downloading",
      "codeList": [
        {
          "language": "APIDOC",
          "code": "openmeteo-api download-era5 --help\n\nUsage: openmeteo-api download-era5 <domain> [--timeinterval,-t] [--stripseaYear,-s] [--cdskey,-k]\n\nDownload ERA5 from the ECMWF climate data store and convert\n\nOptions:\n  timeinterval Timeinterval to download with format 20220101-20220131\n          year Download one year\n        cdskey CDS API key like: f412e2d2-4123-456..."
        }
      ],
      "relevance": 0.013157895,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Downloading ERA5 Data for an Entire Year (Shell)",
      "codeDescription": "This command facilitates downloading a full year of ERA5 data using `openmeteo-api download-era5`. It requires specifying the `domain`, the `timeinterval` covering the entire year (e.g., `YYYY0101-YYYY1231`), and a valid Copernicus CDS API key. Approximately 60 GB of disk space is needed per year of data.",
      "codeLanguage": "Shell",
      "codeTokens": 124,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/downloading-datasets.md#_snippet_11",
      "pageTitle": "Downloading Weather Datasets with Open-Meteo API",
      "codeList": [
        {
          "language": "Shell",
          "code": "openmeteo-api download-era5 <domain> --timeinterval 20210101-20211231 --cdskey"
        }
      ],
      "relevance": 0.012987013,
      "model": "gemini-2.5-flash-preview-05-20"
    },
    {
      "codeTitle": "Download MeteoFrance Wave and Currents Data",
      "codeDescription": "Downloads MeteoFrance wave (mfwave) and currents (mfcurrents) data, allowing specification of concurrent downloads.",
      "codeLanguage": "bash",
      "codeTokens": 146,
      "codeId": "https://github.com/open-meteo/open-meteo/blob/main/docs/cronjobs.md#_snippet_30",
      "pageTitle": "Open-Meteo Cronjobs",
      "codeList": [
        {
          "language": "bash",
          "code": "0  0,12 * * * /usr/local/bin/openmeteo-api download-mfwave mfwave --concurrent 4 > ~/log/mfwave.log 2>&1 || cat ~/log/mfwave.log\n0    12 * * * /usr/local/bin/openmeteo-api download-mfwave mfcurrents --concurrent 4 > ~/log/mfcurrents.log 2>&1 || cat ~/log/mfcurrents.log"
        }
      ],
      "relevance": 0.012820513,
      "model": "gemini-2.5-flash-lite"
    }
  ],
  "metadata": {
    "authentication": "personal"
  }
}