FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
# The service binds 8080 and needs no privileged-port capability. Remove the
# image's file capability so exec works with a non-root user and cap_drop ALL.
RUN setcap -r /usr/bin/caddy
USER 10001:10001
