#!/bin/sh
# Explicit, single-variable envsubst — deliberately NOT using nginx's
# built-in /etc/nginx/templates auto-processing, which substitutes based
# on the full set of currently-defined container env vars. Restricting to
# exactly $API_UPSTREAM guarantees nginx's own $host/$uri/$remote_addr/
# $proxy_add_x_forwarded_for variables can never be touched, regardless of
# what other env vars happen to be present in the container.
set -e
envsubst '$API_UPSTREAM' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
