#base image
FROM ubuntu:16.04
MAINTAINER OriginTrail

RUN apt-get -qq update
RUN apt-get -qq -y install curl
RUN curl -sL https://deb.nodesource.com/setup_9.x |  bash -
RUN apt-get -qq -y install wget apt-transport-https software-properties-common build-essential git nodejs
RUN npm -v
#ArangoDB
ADD install-arango.sh /install-arango.sh
RUN ["chmod", "+x", "/install-arango.sh"]
RUN /install-arango.sh
#SQLite
RUN apt-get -qq -y  install sqlite3

RUN export LC_ALL=C

#Clone the project
RUN git clone -b develop https://github.com/OriginTrail/ot-node.git

WORKDIR /ot-node
RUN mkdir keys data &> /dev/null
RUN cp .env.example .env && npm install
# CMD npm start
# RUN chmod 777 /usr/local/bin/install.sh
#CMD /usr/local/bin/install.sh
