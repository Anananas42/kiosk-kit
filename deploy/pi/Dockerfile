FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    qemu-system-arm \
    qemu-utils \
    libguestfs-tools \
    linux-image-amd64 \
    ansible \
    sshpass \
    curl \
    jq \
    xz-utils \
    dpkg-dev \
    python3 \
    openssh-client \
    rsync \
    cpio \
    gzip \
    petname \
  && rm -rf /var/lib/apt/lists/*

# libguestfs needs a kernel to boot its appliance
ENV LIBGUESTFS_BACKEND=direct

WORKDIR /workspace

ENTRYPOINT ["/workspace/deploy/pi/build-sd-image.sh"]
