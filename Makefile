# Stratum site — common dev commands.
# Run `make` (no args) to see the list.
#
# `rbenv exec` honors .ruby-version (4.0.1) instead of falling through to
# the system Ruby 2.6, which can't load the bundler version pinned in
# Gemfile.lock.

BUNDLE := rbenv exec bundle

.PHONY: help serve build clean install audit consolidate inject-og

help:  ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

serve:  ## Run the dev server with livereload (http://127.0.0.1:4000)
	# --baseurl "" overrides the production baseurl so local dev URLs
	# don't include the /stratum-chairman-briefing/ subpath
	$(BUNDLE) exec jekyll serve --livereload --baseurl ""

build:  ## One-shot build into _site/
	$(BUNDLE) exec jekyll build

clean:  ## Remove _site/ and Jekyll caches
	rm -rf _site .jekyll-cache .jekyll-metadata

install:  ## Install Ruby gems into vendor/bundle (first-time setup)
	$(BUNDLE) config set --local path 'vendor/bundle'
	$(BUNDLE) install

audit:  ## Report duplicated inline CSS across all pages
	node scripts/css-extract.js

consolidate:  ## (DANGEROUS) Re-run CSS dedup + inject stylesheet links
	node scripts/css-consolidate.js --write

inject-og:  ## (DANGEROUS) Re-inject Open Graph + JSON-LD into every page
	node scripts/inject-og-jsonld.js --write
