FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_PRIORITY=high

# Set environment variables
ENV DISPLAY_NUM=99
ENV DISPLAY=:${DISPLAY_NUM}
ENV WIDTH=1280
ENV HEIGHT=800

# Install required packages
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    mutter \
    tint2 \
    wget \
    git \
    net-tools \
    dbus-x11 \
    gnome-icon-theme \
    adwaita-icon-theme \
    hicolor-icon-theme \
    sudo \
    x11-xserver-utils \
    python3 \
    python3-pip \
    software-properties-common \
    scrot \
    gnome-screenshot \
    xdotool \
    xsel \
    xclip \
    && add-apt-repository ppa:mozillateam/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    firefox-esr \
    libreoffice \
    x11-apps \
    gedit \
    xpaint \
    galculator \
    pcmanfm \
    libfm-modules \
    && rm -rf /var/lib/apt/lists/*

# Install noVNC and websockify
RUN mkdir -p /opt && cd /opt \
    && git clone https://github.com/novnc/noVNC.git \
    && cd noVNC \
    && git checkout v1.4.0 \
    && ln -s vnc.html index.html \
    && pip3 install websockify

# Setup user
ENV USERNAME=computeruse
ENV HOME=/home/$USERNAME
RUN useradd -m -s /bin/bash -d $HOME $USERNAME && \
    echo "${USERNAME} ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# Create necessary directories and files
RUN mkdir -p /app $HOME/.config/tint2 \
    && mkdir -p /tmp/x11vnc_logs \
    && mkdir -p /tmp/novnc_logs \
    && touch /tmp/x11vnc_logs/x11vnc.log \
    && touch /tmp/novnc_logs/novnc.log

# Create a basic tint2 config
RUN echo 'panel_position = bottom center horizontal\n\
panel_size = 100% 30\n\
panel_items = TSC\n\
panel_background_id = 1\n\
taskbar_mode = single_desktop\n\
taskbar_padding = 0 0 2\n\
task_text = 1\n\
task_maximum_size = 150 35\n\
systray_padding = 0 4 2\n\
clock_format = %H:%M' > $HOME/.config/tint2/tint2rc

# Create Desktop directory and add some basic desktop entries
RUN mkdir -p $HOME/Desktop && \
    echo '[Desktop Entry]\n\
Type=Application\n\
Name=Firefox ESR\n\
Exec=firefox-esr\n\
Icon=firefox-esr\n\
Terminal=false\n\
Categories=Network;WebBrowser;' > $HOME/Desktop/firefox.desktop && \
    echo '[Desktop Entry]\n\
Type=Application\n\
Name=Calculator\n\
Exec=galculator\n\
Icon=galculator\n\
Terminal=false\n\
Categories=Utility;Calculator;' > $HOME/Desktop/calculator.desktop && \
    echo '[Desktop Entry]\n\
Type=Application\n\
Name=Text Editor\n\
Exec=gedit\n\
Icon=gedit\n\
Terminal=false\n\
Categories=Utility;TextEditor;' > $HOME/Desktop/gedit.desktop && \
    chmod +x $HOME/Desktop/*.desktop

# Setup PCManFM configuration
RUN mkdir -p $HOME/.config/pcmanfm/default && \
    echo '[config]\n\
show_desktop=1\n\
desktop_bg=#2e3436\n\
desktop_fg=#ffffff\n\
desktop_shadow=#000000\n\
show_wm_menu=0\n\
sort_type=name\n\
sort_by=ascending' > $HOME/.config/pcmanfm/default/pcmanfm.conf

# Create named pipes for log streaming
RUN mkfifo /tmp/x11vnc_logs/x11vnc_pipe \
    && mkfifo /tmp/novnc_logs/novnc_pipe

# Copy startup scripts
COPY entrypoint.sh /app/
COPY start_all.sh /app/
COPY xvfb_startup.sh /app/
COPY x11vnc_startup.sh /app/
COPY novnc_startup.sh /app/
COPY mutter_startup.sh /app/
COPY tint2_startup.sh /app/
COPY pcmanfm_startup.sh /app/

# Set proper ownership
RUN chown -R $USERNAME:$USERNAME $HOME && \
    chown -R $USERNAME:$USERNAME /app && \
    chown -R $USERNAME:$USERNAME /tmp/x11vnc_logs && \
    chown -R $USERNAME:$USERNAME /tmp/novnc_logs

# Set working directory
WORKDIR /app

# Make scripts executable
RUN chmod +x *.sh

# Setup dbus
RUN mkdir -p /var/run/dbus && \
    chown -R $USERNAME:$USERNAME /var/run/dbus && \
    rm -f /var/run/dbus/pid && \
    rm -f /var/run/dbus/system_bus_socket && \
    dbus-uuidgen > /var/lib/dbus/machine-id && \
    chown -R $USERNAME:$USERNAME /var/lib/dbus

# Expose ports
EXPOSE 5900 6080

# Switch to non-root user
USER $USERNAME

# Set entrypoint
ENTRYPOINT ["./entrypoint.sh"]
