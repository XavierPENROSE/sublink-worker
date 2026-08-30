export const formLogicFn = (t) => {
    window.formData = function () {
        // Keep the browser-side logic self-contained because Form.jsx serializes
        // formLogicFn with toString() before executing it.

        const getBasePath = () => {
            const pathname = window.location.pathname || '/';

            // Known application endpoints. The application home page is the
            // reliable source for detecting the external deployment prefix.
            const endpointNames = [
                '/singbox',
                '/clash',
                '/xray',
                '/surge',
                '/subconverter',
                '/config',
                '/shorten-v2',
                '/resolve'
            ];

            // If the current path is an application endpoint, derive the
            // prefix from the first segment.
            for (const endpoint of endpointNames) {
                const index = pathname.indexOf(endpoint);
                if (index > 0) {
                    return pathname.slice(0, index);
                }
            }

            // When the home page is opened under a prefix such as
            // /sublink-worker/ or /sub/, use the first path segment.
            const match = pathname.match(/^\/([^/]+)(?:\/)?$/);
            if (match && match[1]) {
                const segment = `/${match[1]}`;

                // Avoid treating normal root-level assets or files as a
                // deployment prefix.
                const rootFiles = [
                    '/favicon.ico',
                    '/robots.txt',
                    '/manifest.json'
                ];

                if (!rootFiles.includes(segment)) {
                    return segment;
                }
            }

            return '';
        };

        const getApiPath = (path) => {
            const basePath = getBasePath();

            if (!path.startsWith('/')) {
                path = `/${path}`;
            }

            return `${basePath}${path}`;
        };

        const getExternalUrl = (path, queryString = '') => {
            const origin = window.location.origin;
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            const basePath = getBasePath();

            return `${origin}${basePath}${normalizedPath}${queryString}`;
        };

        // Inline parseSurgeConfigInput to make it available in toString()
        const parseSurgeValue = (rawValue = '') => {
            const trimmed = rawValue.trim();
            if (trimmed === '') return '';

            const unquoted = trimmed.replace(/^"(.*)"$/, '$1');
            const lower = unquoted.toLowerCase();

            if (lower === 'true') return true;
            if (lower === 'false') return false;
            if (/^-?\d+(\.\d+)?$/.test(unquoted)) {
                return Number(unquoted);
            }

            return unquoted;
        };

        const convertSurgeIniToJson = (content) => {
            const lines = content.split(/\r?\n/);
            const config = {};
            let currentSection = null;

            const ensureObject = (key) => {
                if (!config[key]) config[key] = {};
                return config[key];
            };

            const ensureArray = (key) => {
                if (!config[key]) config[key] = [];
                return config[key];
            };

            for (const rawLine of lines) {
                const line = rawLine.trim();

                if (!line || line.startsWith(';') || line.startsWith('#')) {
                    continue;
                }

                const sectionMatch = line.match(/^\[(.+)]$/);

                if (sectionMatch) {
                    currentSection = sectionMatch[1].trim();
                    continue;
                }

                if (!currentSection) continue;

                const sectionName = currentSection.toLowerCase();

                if (
                    sectionName === 'general' ||
                    sectionName === 'replica'
                ) {
                    const equalsIndex = line.indexOf('=');

                    if (equalsIndex === -1) continue;

                    const key = line.slice(0, equalsIndex).trim();
                    const value = line.slice(equalsIndex + 1).trim();

                    if (!key) continue;

                    const target = ensureObject(sectionName);
                    target[key] = parseSurgeValue(value);

                } else if (sectionName === 'proxy') {
                    ensureArray('proxies').push(line);

                } else if (sectionName === 'proxy group') {
                    ensureArray('proxy-groups').push(line);

                } else if (sectionName === 'rule') {
                    ensureArray('rules').push(line);

                } else {
                    ensureArray(sectionName).push(line);
                }
            }

            if (
                !config.general &&
                !config.replica &&
                !config.proxies &&
                !config['proxy-groups']
            ) {
                throw new Error('Unable to parse Surge INI content');
            }

            return config;
        };

        const parseSurgeConfigInput = (content) => {
            const trimmed = content.trim();

            if (!trimmed) {
                throw new Error('Config content is empty');
            }

            try {
                return {
                    configObject: JSON.parse(trimmed),
                    convertedFromIni: false
                };
            } catch {
                const converted = convertSurgeIniToJson(content);

                return {
                    configObject: converted,
                    convertedFromIni: true
                };
            }
        };

        return {
            input: '',
            showAdvanced: false,

            accordionSections: {
                rules: true,
                customRules: false,
                general: false,
                baseConfig: false,
                ua: false
            },

            selectedRules: [],
            selectedPredefinedRule: 'balanced',

            subconverterCopied: false,

            groupByCountry: false,
            includeAutoSelect: true,
            enableClashUI: false,

            externalController: '',
            externalUiDownloadUrl: '',

            configType: 'singbox',
            configEditor: '',

            savingConfig: false,
            currentConfigId: '',

            saveConfigText: '',
            savingConfigText: '',
            configContentRequiredText: '',
            configSaveFailedText: '',

            configValidationState: '',
            configValidationMessage: '',

            customUA: '',

            loading: false,

            generatedLinks: null,
            shortenedLinks: null,

            shortening: false,
            customShortCode: '',

            parsingUrl: false,
            parseDebounceTimer: null,

            processingText: '',
            convertText: '',
            shortenLinksText: '',
            shorteningText: '',
            showFullLinksText: '',

            init() {
                if (window.APP_TRANSLATIONS) {
                    this.processingText =
                        window.APP_TRANSLATIONS.processing;

                    this.convertText =
                        window.APP_TRANSLATIONS.convert;

                    this.shortenLinksText =
                        window.APP_TRANSLATIONS.shortenLinks;

                    this.shorteningText =
                        window.APP_TRANSLATIONS.shortening;

                    this.showFullLinksText =
                        window.APP_TRANSLATIONS.showFullLinks;

                    this.saveConfigText =
                        window.APP_TRANSLATIONS.saveConfig;

                    this.savingConfigText =
                        window.APP_TRANSLATIONS.savingConfig;

                    this.configContentRequiredText =
                        window.APP_TRANSLATIONS.configContentRequired;

                    this.configSaveFailedText =
                        window.APP_TRANSLATIONS.configSaveFailed;
                }

                this.input =
                    localStorage.getItem('inputTextarea') || '';

                this.showAdvanced =
                    localStorage.getItem('advancedToggle') === 'true';

                this.groupByCountry =
                    localStorage.getItem('groupByCountry') === 'true';

                this.includeAutoSelect =
                    localStorage.getItem('includeAutoSelect') !== 'false';

                this.enableClashUI =
                    localStorage.getItem('enableClashUI') === 'true';

                this.externalController =
                    localStorage.getItem('externalController') || '';

                this.externalUiDownloadUrl =
                    localStorage.getItem('externalUiDownloadUrl') || '';

                this.customUA =
                    localStorage.getItem('userAgent') || '';

                this.configEditor =
                    localStorage.getItem('configEditor') || '';

                this.configType =
                    localStorage.getItem('configType') || 'singbox';

                this.customShortCode =
                    localStorage.getItem('customShortCode') || '';

                const initialUrlParams =
                    new URLSearchParams(window.location.search);

                this.currentConfigId =
                    initialUrlParams.get('configId') || '';

                const savedAccordion =
                    localStorage.getItem('accordionSections');

                if (savedAccordion) {
                    try {
                        this.accordionSections =
                            JSON.parse(savedAccordion);
                    } catch (e) {
                        // Keep defaults.
                    }
                }

                this.applyPredefinedRule();

                this.$watch('input', val => {
                    localStorage.setItem('inputTextarea', val);
                    this.handleInputChange(val);
                });

                this.$watch('showAdvanced', val =>
                    localStorage.setItem('advancedToggle', val)
                );

                this.$watch('groupByCountry', val =>
                    localStorage.setItem('groupByCountry', val)
                );

                this.$watch('includeAutoSelect', val =>
                    localStorage.setItem('includeAutoSelect', val)
                );

                this.$watch('enableClashUI', val =>
                    localStorage.setItem('enableClashUI', val)
                );

                this.$watch('externalController', val =>
                    localStorage.setItem('externalController', val)
                );

                this.$watch('externalUiDownloadUrl', val =>
                    localStorage.setItem(
                        'externalUiDownloadUrl',
                        val
                    )
                );

                this.$watch('customUA', val =>
                    localStorage.setItem('userAgent', val)
                );

                this.$watch('configEditor', val => {
                    localStorage.setItem('configEditor', val);
                    this.resetConfigValidation();
                });

                this.$watch('configType', val => {
                    localStorage.setItem('configType', val);
                    this.resetConfigValidation();
                });

                this.$watch('customShortCode', val =>
                    localStorage.setItem('customShortCode', val)
                );

                this.$watch(
                    'accordionSections',
                    val =>
                        localStorage.setItem(
                            'accordionSections',
                            JSON.stringify(val)
                        ),
                    { deep: true }
                );
            },

            toggleAccordion(section) {
                this.accordionSections[section] =
                    !this.accordionSections[section];
            },

            applyPredefinedRule() {
                if (this.selectedPredefinedRule === 'custom') {
                    return;
                }

                const rules = window.PREDEFINED_RULE_SETS;

                if (
                    rules &&
                    rules[this.selectedPredefinedRule]
                ) {
                    this.selectedRules =
                        rules[this.selectedPredefinedRule];
                }
            },

            getSubconverterUrl() {
                const params = new URLSearchParams();

                if (
                    this.selectedPredefinedRule &&
                    this.selectedPredefinedRule !== 'custom'
                ) {
                    params.append(
                        'selectedRules',
                        this.selectedPredefinedRule
                    );

                } else if (
                    this.selectedPredefinedRule === 'custom'
                ) {
                    params.append(
                        'selectedRules',
                        JSON.stringify(this.selectedRules)
                    );
                }

                try {
                    const customRulesInput =
                        document.querySelector(
                            'input[name="customRules"]'
                        );

                    const customRules =
                        customRulesInput &&
                        customRulesInput.value
                            ? JSON.parse(customRulesInput.value)
                            : [];

                    if (
                        Array.isArray(customRules) &&
                        customRules.length > 0
                    ) {
                        params.append(
                            'customRules',
                            JSON.stringify(customRules)
                        );
                    }
                } catch {
                    // Ignore malformed optional custom rules.
                }

                if (!this.includeAutoSelect) {
                    params.append(
                        'include_auto_select',
                        'false'
                    );
                }

                if (this.groupByCountry) {
                    params.append(
                        'group_by_country',
                        'true'
                    );
                }

                const appLang =
                    window.APP_LANG || 'zh-CN';

                if (appLang !== 'zh-CN') {
                    params.append('lang', appLang);
                }

                const queryString = params.toString();

                return getExternalUrl(
                    '/subconverter',
                    queryString ? `?${queryString}` : ''
                );
            },

            copySubconverterUrl() {
                const url = this.getSubconverterUrl();

                navigator.clipboard
                    .writeText(url)
                    .then(() => {
                        this.subconverterCopied = true;

                        setTimeout(
                            () =>
                                (this.subconverterCopied =
                                    false),
                            2000
                        );
                    })
                    .catch(() => {});
            },

            resetConfigValidation() {
                this.configValidationState = '';
                this.configValidationMessage = '';
            },

            async saveBaseConfig() {
                const content =
                    (this.configEditor || '').trim();

                if (!content) {
                    alert(
                        this.configContentRequiredText ||
                        window.APP_TRANSLATIONS.configContentRequired
                    );
                    return;
                }

                let payloadContent = this.configEditor;

                if (this.configType === 'surge') {
                    try {
                        const { configObject } =
                            parseSurgeConfigInput(
                                this.configEditor
                            );

                        payloadContent =
                            JSON.stringify(configObject);

                    } catch (parseError) {
                        const prefix =
                            window.APP_TRANSLATIONS
                                .configValidationError ||
                            'Config validation error:';

                        alert(
                            `${prefix} ${
                                parseError?.message || ''
                            }`.trim()
                        );

                        return;
                    }
                }

                this.savingConfig = true;

                try {
                    const response = await fetch(
                        getApiPath('/config'),
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json'
                            },

                            body: JSON.stringify({
                                type: this.configType,
                                content: payloadContent
                            })
                        }
                    );

                    const responseText =
                        await response.text();

                    if (!response.ok) {
                        throw new Error(
                            responseText ||
                            response.statusText ||
                            'Request failed'
                        );
                    }

                    const configId =
                        responseText.trim();

                    if (!configId) {
                        throw new Error(
                            'Missing config ID'
                        );
                    }

                    this.currentConfigId =
                        configId;

                    this.updateConfigIdInUrl(
                        configId
                    );

                    const successMessage =
                        window.APP_TRANSLATIONS
                            .saveConfigSuccess ||
                        'Configuration saved successfully!';

                    alert(
                        `${successMessage}\nID: ${configId}`
                    );

                } catch (error) {
                    console.error(
                        'Failed to save base config:',
                        error
                    );

                    const errorPrefix =
                        this.configSaveFailedText ||
                        window.APP_TRANSLATIONS
                            .configSaveFailed ||
                        'Failed to save configuration';

                    alert(
                        `${errorPrefix}: ${
                            error?.message ||
                            'Unknown error'
                        }`
                    );

                } finally {
                    this.savingConfig = false;
                }
            },

            validateBaseConfig() {
                const content =
                    (this.configEditor || '').trim();

                if (!content) {
                    this.configValidationState =
                        'error';

                    this.configValidationMessage =
                        this.configContentRequiredText ||
                        window.APP_TRANSLATIONS
                            .configContentRequired;

                    return;
                }

                try {
                    if (this.configType === 'clash') {
                        if (
                            !window.jsyaml ||
                            !window.jsyaml.load
                        ) {
                            throw new Error(
                                window.APP_TRANSLATIONS
                                    .parserUnavailable ||
                                'Parser unavailable. Please refresh and try again.'
                            );
                        }

                        window.jsyaml.load(content);

                        this.configValidationState =
                            'success';

                        this.configValidationMessage =
                            window.APP_TRANSLATIONS
                                .validYamlConfig ||
                            'YAML config is valid';

                    } else if (
                        this.configType === 'surge'
                    ) {
                        parseSurgeConfigInput(
                            this.configEditor
                        );

                        this.configValidationState =
                            'success';

                        this.configValidationMessage =
                            window.APP_TRANSLATIONS
                                .validJsonConfig ||
                            'JSON config is valid';

                    } else {
                        JSON.parse(content);

                        this.configValidationState =
                            'success';

                        this.configValidationMessage =
                            window.APP_TRANSLATIONS
                                .validJsonConfig ||
                            'JSON config is valid';
                    }

                } catch (error) {
                    this.configValidationState =
                        'error';

                    const prefix =
                        window.APP_TRANSLATIONS
                            .configValidationError ||
                        'Config validation error: ';

                    this.configValidationMessage =
                        `${prefix}${
                            error?.message || ''
                        }`;
                }
            },

            clearBaseConfig() {
                if (
                    confirm(
                        window.APP_TRANSLATIONS
                            .confirmClearConfig
                    )
                ) {
                    this.configEditor = '';

                    localStorage.removeItem(
                        'configEditor'
                    );

                    this.currentConfigId = '';

                    this.updateConfigIdInUrl(null);
                }
            },

            clearAll() {
                if (
                    confirm(
                        window.APP_TRANSLATIONS
                            .confirmClearAll
                    )
                ) {
                    this.input = '';
                    this.generatedLinks = null;
                    this.shortenedLinks = null;
                    this.customShortCode = '';

                    localStorage.removeItem(
                        'customShortCode'
                    );
                }
            },

            updateConfigIdInUrl(configId) {
                const url =
                    new URL(
                        window.location.href
                    );

                if (configId) {
                    url.searchParams.set(
                        'configId',
                        configId
                    );
                } else {
                    url.searchParams.delete(
                        'configId'
                    );
                }

                window.history.replaceState(
                    {},
                    '',
                    `${url.pathname}${url.search}${url.hash}`
                );
            },

            async submitForm() {
                this.loading = true;
                this.shortenedLinks = null;

                try {
                    const customRulesInput =
                        document.querySelector(
                            'input[name="customRules"]'
                        );

                    const customRules =
                        customRulesInput &&
                        customRulesInput.value
                            ? JSON.parse(
                                  customRulesInput.value
                              )
                            : [];

                    const params =
                        new URLSearchParams();

                    params.append(
                        'config',
                        this.input
                    );

                    params.append(
                        'ua',
                        this.customUA
                    );

                    params.append(
                        'selectedRules',
                        JSON.stringify(
                            this.selectedRules
                        )
                    );

                    params.append(
                        'customRules',
                        JSON.stringify(
                            customRules
                        )
                    );

                    if (this.groupByCountry) {
                        params.append(
                            'group_by_country',
                            'true'
                        );
                    }

                    if (!this.includeAutoSelect) {
                        params.append(
                            'include_auto_select',
                            'false'
                        );
                    }

                    if (this.enableClashUI) {
                        params.append(
                            'enable_clash_ui',
                            'true'
                        );
                    }

                    if (this.externalController) {
                        params.append(
                            'external_controller',
                            this.externalController
                        );
                    }

                    if (
                        this.externalUiDownloadUrl
                    ) {
                        params.append(
                            'external_ui_download_url',
                            this.externalUiDownloadUrl
                        );
                    }

                    const urlParams =
                        new URLSearchParams(
                            window.location.search
                        );

                    const configId =
                        this.currentConfigId ||
                        urlParams.get(
                            'configId'
                        );

                    if (configId) {
                        params.append(
                            'configId',
                            configId
                        );
                    }

                    const queryString =
                        params.toString();

                    this.generatedLinks = {
                        xray: getExternalUrl(
                            '/xray',
                            `?${queryString}`
                        ),

                        singbox: getExternalUrl(
                            '/singbox',
                            `?${queryString}`
                        ),

                        clash: getExternalUrl(
                            '/clash',
                            `?${queryString}`
                        ),

                        surge: getExternalUrl(
                            '/surge',
                            `?${queryString}`
                        )
                    };

                    setTimeout(() => {
                        const resultsDiv =
                            document.querySelector(
                                '.mt-12'
                            );

                        if (resultsDiv) {
                            resultsDiv.scrollIntoView({
                                behavior: 'smooth'
                            });
                        }
                    }, 100);

                } catch (error) {
                    console.error(
                        'Error generating links:',
                        error
                    );

                    alert(
                        window.APP_TRANSLATIONS
                            .errorGeneratingLinks
                    );

                } finally {
                    this.loading = false;
                }
            },

            async shortenLinks() {
                if (this.shortenedLinks) {
                    alert(
                        window.APP_TRANSLATIONS
                            .alreadyShortened
                    );

                    return;
                }

                if (!this.generatedLinks) {
                    return;
                }

                this.shortening = true;

                try {
                    const shortened = {};

                    let shortCode =
                        this.customShortCode.trim();

                    let isFirstRequest = true;

                    for (
                        const [type, url]
                        of Object.entries(
                            this.generatedLinks
                        )
                    ) {
                        try {
                            let apiUrl =
                                `${getApiPath(
                                    '/shorten-v2'
                                )}?url=${encodeURIComponent(
                                    url
                                )}`;

                            if (shortCode) {
                                apiUrl +=
                                    `&shortCode=${encodeURIComponent(
                                        shortCode
                                    )}`;
                            }

                            const response =
                                await fetch(
                                    apiUrl
                                );

                            if (!response.ok) {
                                throw new Error(
                                    `Failed to shorten ${type} link`
                                );
                            }

                            const returnedCode =
                                (
                                    await response.text()
                                ).trim();

                            if (
                                !returnedCode
                            ) {
                                throw new Error(
                                    `Empty short code returned for ${type}`
                                );
                            }

                            if (
                                isFirstRequest &&
                                !shortCode
                            ) {
                                shortCode =
                                    returnedCode;
                            }

                            isFirstRequest = false;

                            const prefixMap = {
                                xray: 'x',
                                singbox: 'b',
                                clash: 'c',
                                surge: 's'
                            };

                            shortened[type] =
                                getExternalUrl(
                                    `/${prefixMap[type]}/${returnedCode}`
                                );

                        } catch (error) {
                            console.error(
                                `Error shortening ${type} link:`,
                                error
                            );

                            throw error;
                        }
                    }

                    this.shortenedLinks =
                        shortened;

                } catch (error) {
                    console.error(
                        'Error shortening links:',
                        error
                    );

                    alert(
                        window.APP_TRANSLATIONS
                            .shortenFailed
                    );

                } finally {
                    this.shortening = false;
                }
            },

            handleInputChange(val) {
                if (this.parseDebounceTimer) {
                    clearTimeout(
                        this.parseDebounceTimer
                    );
                }

                if (!val || !val.trim()) {
                    return;
                }

                this.parseDebounceTimer =
                    setTimeout(() => {
                        this.tryParseSubscriptionUrl(
                            val.trim()
                        );
                    }, 500);
            },

            isSubscriptionUrl(text) {
                if (text.includes('\n')) {
                    return false;
                }

                try {
                    const url =
                        new URL(text);

                    const basePath =
                        getBasePath();

                    // Remove our deployment prefix before
                    // checking application endpoints.
                    let pathname =
                        url.pathname;

                    if (
                        basePath &&
                        (
                            pathname === basePath ||
                            pathname.startsWith(
                                `${basePath}/`
                            )
                        )
                    ) {
                        pathname =
                            pathname.slice(
                                basePath.length
                            ) || '/';
                    }

                    const pathMatch =
                        pathname.match(
                            /^\/([bcxs])\/([a-zA-Z0-9_-]+)$/
                        );

                    if (pathMatch) {
                        return true;
                    }

                    const fullMatch =
                        pathname.match(
                            /^\/(singbox|clash|xray|surge)$/
                        );

                    if (
                        fullMatch &&
                        url.search
                    ) {
                        return true;
                    }

                    return false;

                } catch {
                    return false;
                }
            },

            async tryParseSubscriptionUrl(text) {
                if (!this.isSubscriptionUrl(text)) {
                    return;
                }

                this.parsingUrl = true;

                try {
                    let urlToParse;

                    try {
                        urlToParse =
                            new URL(text);
                    } catch {
                        return;
                    }

                    const basePath =
                        getBasePath();

                    let pathname =
                        urlToParse.pathname;

                    if (
                        basePath &&
                        (
                            pathname === basePath ||
                            pathname.startsWith(
                                `${basePath}/`
                            )
                        )
                    ) {
                        pathname =
                            pathname.slice(
                                basePath.length
                            ) || '/';
                    }

                    const shortMatch =
                        pathname.match(
                            /^\/([bcxs])\/([a-zA-Z0-9_-]+)$/
                        );

                    if (shortMatch) {
                        const response =
                            await fetch(
                                `${getApiPath(
                                    '/resolve'
                                )}?url=${encodeURIComponent(
                                    text
                                )}`
                            );

                        if (!response.ok) {
                            console.warn(
                                'Failed to resolve short URL'
                            );

                            return;
                        }

                        const data =
                            await response.json();

                        if (
                            !data.originalUrl
                        ) {
                            console.warn(
                                'No original URL returned'
                            );

                            return;
                        }

                        urlToParse =
                            new URL(
                                data.originalUrl
                            );
                    }

                    this.populateFormFromUrl(
                        urlToParse
                    );

                    const message =
                        window.APP_TRANSLATIONS
                            ?.urlParsedSuccess ||
                        '已成功解析订阅链接配置';

                    console.log(message);

                } catch (error) {
                    console.error(
                        'Error parsing subscription URL:',
                        error
                    );

                } finally {
                    this.parsingUrl = false;
                }
            },

            populateFormFromUrl(url) {
                const params =
                    new URLSearchParams(
                        url.search
                    );

                const config =
                    params.get('config');

                if (config) {
                    this.input = config;
                }

                const selectedRules =
                    params.get(
                        'selectedRules'
                    );

                if (selectedRules) {
                    try {
                        const parsed =
                            JSON.parse(
                                selectedRules
                            );

                        if (
                            Array.isArray(parsed)
                        ) {
                            this.selectedRules =
                                parsed;

                            this.selectedPredefinedRule =
                                'custom';
                        }

                    } catch (e) {
                        console.warn(
                            'Failed to parse selectedRules:',
                            e
                        );
                    }
                }

                const customRules =
                    params.get(
                        'customRules'
                    );

                if (customRules) {
                    try {
                        const parsed =
                            JSON.parse(
                                customRules
                            );

                        if (
                            Array.isArray(parsed) &&
                            parsed.length > 0
                        ) {
                            window.dispatchEvent(
                                new CustomEvent(
                                    'restore-custom-rules',
                                    {
                                        detail: {
                                            rules: parsed
                                        }
                                    }
                                )
                            );
                        }

                    } catch (e) {
                        console.warn(
                            'Failed to parse customRules:',
                            e
                        );
                    }
                }

                this.groupByCountry =
                    params.get(
                        'group_by_country'
                    ) === 'true';

                this.includeAutoSelect =
                    params.get(
                        'include_auto_select'
                    ) !== 'false';

                this.enableClashUI =
                    params.get(
                        'enable_clash_ui'
                    ) === 'true';

                const externalController =
                    params.get(
                        'external_controller'
                    );

                if (externalController) {
                    this.externalController =
                        externalController;
                }

                const externalUiDownloadUrl =
                    params.get(
                        'external_ui_download_url'
                    );

                if (
                    externalUiDownloadUrl
                ) {
                    this.externalUiDownloadUrl =
                        externalUiDownloadUrl;
                }

                const ua =
                    params.get('ua');

                if (ua) {
                    this.customUA = ua;
                }

                const configId =
                    params.get('configId');

                if (configId) {
                    this.currentConfigId =
                        configId;

                    this.updateConfigIdInUrl(
                        configId
                    );
                }

                if (
                    selectedRules ||
                    customRules ||
                    this.groupByCountry ||
                    this.enableClashUI ||
                    externalController ||
                    externalUiDownloadUrl ||
                    ua ||
                    configId
                ) {
                    this.showAdvanced = true;
                }
            }
        };
    }
};
