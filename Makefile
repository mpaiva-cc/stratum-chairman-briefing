# Stratum site — common dev commands.
# Run `make` (no args) to see the list.

.PHONY: help serve build clean install audit consolidate inject-og

help:  ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

serve:  ## Run the dev server with livereload (http://127.0.0.1:4000)
	bundle exec jekyll serve --livereload

build:  ## One-shot build into _site/
	bundle exec jekyll build

clean:  ## Remove _site/ and Jekyll caches
	rm -rf _site .jekyll-cache .jekyll-metadata

install:  ## Install Ruby gems into vendor/bundle (first-time setup)
	bundle config set --local path 'vendor/bundle'
	bundle install

audit:  ## Report duplicated inline CSS across all pages
	node scripts/css-extract.js

consolidate:  ## (DANGEROUS) Re-run CSS dedup + inject stylesheet links
	node scripts/css-consolidate.js --write

inject-og:  ## (DANGEROUS) Re-inject Open Graph + JSON-LD into every page
	node scripts/inject-og-jsonld.js --write
